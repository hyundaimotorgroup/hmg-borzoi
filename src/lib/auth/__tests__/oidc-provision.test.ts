import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock: Record<string, unknown> = {
    user: { upsert: vi.fn(), update: vi.fn() },
    cluster: { findMany: vi.fn() },
    userClusterAccess: { findMany: vi.fn(), createMany: vi.fn() },
    externalIdentity: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  };
  // Mirrors both $transaction call shapes used in oidc-provision.ts: an
  // interactive callback (invoked with this same mock as `tx`, since none of
  // the tests need a distinct transactional client) and a batch array of
  // already-invoked mock-call promises.
  prismaMock.$transaction = vi.fn((arg: unknown) =>
    typeof arg === "function" ? arg(prismaMock) : Promise.all(arg as Promise<unknown>[])
  );
  return { prisma: prismaMock };
});

vi.mock("@/lib/cache/credential-cache", () => ({
  credentialCache: { invalidate: vi.fn() },
}));

vi.mock("@/lib/cache/client-pool", () => ({
  clickHouseClientPool: { invalidateCluster: vi.fn() },
}));

import { prisma as realPrisma } from "@/lib/prisma";
import { credentialCache } from "@/lib/cache/credential-cache";
import { clickHouseClientPool } from "@/lib/cache/client-pool";
import { ensureAdminPrivileges, hasExternalIdentity, resolveSsoUser } from "../oidc-provision";

// The real Prisma client's method types are generic and call-site-dependent;
// cast to a minimal mock-friendly shape instead of fighting that here.
const prisma = realPrisma as unknown as {
  user: { upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  cluster: { findMany: ReturnType<typeof vi.fn> };
  userClusterAccess: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  externalIdentity: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveSsoUser", () => {
  const params = { issuer: "https://idp.example.com", subject: "sub-1", email: "a@b.com", name: "A" };

  it("returns the bound user directly when its name already matches the IdP's, with no write", async () => {
    const boundUser = { id: "u1", email: "a@b.com", name: "A", role: "viewer", ssoAdminGrantedAt: null };
    prisma.externalIdentity.findUnique.mockResolvedValue({ user: boundUser });

    const user = await resolveSsoUser(params);

    expect(prisma.externalIdentity.findUnique).toHaveBeenCalledWith({
      where: { issuer_subject: { issuer: params.issuer, subject: params.subject } },
      select: { user: { select: { id: true, email: true, name: true, role: true, ssoAdminGrantedAt: true } } },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.externalIdentity.create).not.toHaveBeenCalled();
    expect(user).toEqual(boundUser);
  });

  it("syncs the name on an already-bound identity when the IdP's name has changed", async () => {
    const boundUser = { id: "u1", email: "a@b.com", name: "Old Name", role: "viewer", ssoAdminGrantedAt: null };
    const updatedUser = { ...boundUser, name: "A" };
    prisma.externalIdentity.findUnique.mockResolvedValue({ user: boundUser });
    prisma.user.update.mockResolvedValue(updatedUser);

    const user = await resolveSsoUser(params);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "A" },
      select: { id: true, email: true, name: true, role: true, ssoAdminGrantedAt: true },
    });
    expect(user).toEqual(updatedUser);
  });

  it("on first sight of an identity, links/creates the user by email (syncing name) and binds the identity", async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue(null);
    prisma.user.upsert.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "viewer",
      ssoAdminGrantedAt: null,
    });
    prisma.externalIdentity.create.mockResolvedValue({});

    const user = await resolveSsoUser(params);

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "a@b.com" },
      update: { name: "A" },
      create: { email: "a@b.com", name: "A", role: "viewer", password: null },
      select: { id: true, email: true, name: true, role: true, ssoAdminGrantedAt: true },
    });
    expect(prisma.externalIdentity.create).toHaveBeenCalledWith({
      data: { issuer: params.issuer, subject: params.subject, userId: "u1" },
    });
    expect(user.id).toBe("u1");
  });

  it("resolves to whichever user actually won a concurrent first-login race, not this request's own upsert", async () => {
    // This request's own upsert would resolve to "u1" (e.g. its view of the email
    // claim), but another request won the identity-binding race first and bound
    // a different user, "u2" — the session must follow "u2", the one actually
    // recorded in ExternalIdentity, or it would be issued for the wrong account.
    const raceWinnerUser = { id: "u2", email: "b@b.com", name: "B", role: "viewer", ssoAdminGrantedAt: null };
    prisma.externalIdentity.findUnique
      .mockResolvedValueOnce(null) // initial lookup: not bound yet
      .mockResolvedValueOnce({ user: raceWinnerUser }); // re-check after the race
    prisma.user.upsert.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "viewer",
      ssoAdminGrantedAt: null,
    });
    prisma.externalIdentity.create.mockRejectedValue(new Error("Unique constraint failed"));

    await expect(resolveSsoUser(params)).resolves.toEqual(raceWinnerUser);
  });

  it("re-throws when the identity insert fails for a reason other than a benign race", async () => {
    prisma.externalIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null); // re-check finds nothing bound — a real failure
    prisma.user.upsert.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "viewer",
      ssoAdminGrantedAt: null,
    });
    prisma.externalIdentity.create.mockRejectedValue(new Error("connection reset"));

    await expect(resolveSsoUser(params)).rejects.toThrow();
  });
});

describe("ensureAdminPrivileges", () => {
  const ungrantedListedUser = {
    id: "u1",
    email: "admin@example.com",
    name: "Viewer",
    role: "viewer",
    ssoAdminGrantedAt: null,
  };
  // Previously granted, then manually demoted back to viewer via the app-users UI —
  // the email is still on the allowlist, but the grant marker must make this a no-op.
  const demotedAfterGrant = {
    id: "u2",
    email: "admin@example.com",
    name: "Demoted",
    role: "viewer",
    ssoAdminGrantedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const nonListedUser = {
    id: "u3",
    email: "someone@example.com",
    name: "Someone",
    role: "viewer",
    ssoAdminGrantedAt: null,
  };

  it("does nothing when the email is not in the admin list", async () => {
    await ensureAdminPrivileges(nonListedUser, new Set(["admin@example.com"]));

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.cluster.findMany).not.toHaveBeenCalled();
  });

  it("grants a listed, never-granted viewer admin + missing cluster access, and stamps the marker", async () => {
    prisma.cluster.findMany.mockResolvedValue([
      { id: "c1", username: "u", password: "enc1" },
      { id: "c2", username: "u", password: "enc2" },
    ]);
    prisma.userClusterAccess.findMany.mockResolvedValue([{ clusterId: "c1" }]);

    await ensureAdminPrivileges(ungrantedListedUser, new Set(["admin@example.com"]));

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "admin", ssoAdminGrantedAt: expect.any(Date) },
    });
    expect(prisma.userClusterAccess.createMany).toHaveBeenCalledWith({
      data: [{ userId: "u1", clusterId: "c2", chUsername: "u", chPassword: "enc2" }],
      skipDuplicates: true,
    });
    expect(credentialCache.invalidate).toHaveBeenCalledWith("u1", "c2");
    expect(credentialCache.invalidate).not.toHaveBeenCalledWith("u1", "c1");
    expect(clickHouseClientPool.invalidateCluster).toHaveBeenCalledWith("c2");
  });

  it("does nothing once already granted, even if manually demoted back to viewer while still listed", async () => {
    await ensureAdminPrivileges(demotedAfterGrant, new Set(["admin@example.com"]));

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.cluster.findMany).not.toHaveBeenCalled();
    expect(prisma.userClusterAccess.createMany).not.toHaveBeenCalled();
  });

  it("still stamps the grant even when there are no clusters to back-fill", async () => {
    prisma.cluster.findMany.mockResolvedValue([]);
    prisma.userClusterAccess.findMany.mockResolvedValue([]);

    await ensureAdminPrivileges(ungrantedListedUser, new Set(["admin@example.com"]));

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "admin", ssoAdminGrantedAt: expect.any(Date) },
    });
    expect(prisma.userClusterAccess.createMany).not.toHaveBeenCalled();
    expect(credentialCache.invalidate).not.toHaveBeenCalled();
  });
});

describe("hasExternalIdentity", () => {
  it("returns true when the user has at least one linked identity", async () => {
    prisma.externalIdentity.findFirst.mockResolvedValue({ id: "ei1" });
    expect(await hasExternalIdentity("u1")).toBe(true);
    expect(prisma.externalIdentity.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { id: true },
    });
  });

  it("returns false for a password-only account that never linked SSO", async () => {
    prisma.externalIdentity.findFirst.mockResolvedValue(null);
    expect(await hasExternalIdentity("u1")).toBe(false);
  });
});
