import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock: Record<string, unknown> = {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  // Batch form only (an array of already-invoked mock-call promises) — the
  // only shape createSession() uses.
  prismaMock.$transaction = vi.fn((arg: Promise<unknown>[]) => Promise.all(arg));
  return { prisma: prismaMock };
});

vi.mock("@/lib/feature-flags", () => ({
  getSessionIdleTimeoutMs: vi.fn(),
  getSessionMaxLifetimeMs: vi.fn(),
}));

// Stubbed rather than exercising real AES-256-GCM: these tests care about
// session-store's own logic (what gets stored/returned), not the crypto
// implementation, and real encryption would require an ENCRYPTION_KEY.
vi.mock("@/lib/crypto", () => ({
  encryptSecret: vi.fn(async (secret: string) => `encrypted:${secret}`),
  decryptSecret: vi.fn(async (value: string) => value.replace(/^encrypted:/, "")),
}));

import { prisma } from "@/lib/prisma";
import { getSessionIdleTimeoutMs, getSessionMaxLifetimeMs } from "@/lib/feature-flags";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createSession, getSessionOwner, getSessionUser, peekSessionExpiry, touchSessionActivity } from "../session-store";

// The real Prisma client's method types are generic and call-site-dependent;
// cast to a minimal mock-friendly shape instead of fighting that here.
const mockPrisma = prisma as unknown as {
  session: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const IDLE_TIMEOUT_MS = 5 * 60_000; // 5 minutes, for test readability

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(0);
  vi.mocked(getSessionMaxLifetimeMs).mockReturnValue(24 * 60 * 60 * 1000);
  mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
});

const baseSession = (
  overrides: Partial<{ lastActivityAt: Date; expiresAt: Date; revokedAt: Date | null; idToken: string | null }> = {}
) => ({
  expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60_000),
  revokedAt: overrides.revokedAt ?? null,
  lastActivityAt: overrides.lastActivityAt ?? new Date(),
  idToken: overrides.idToken ?? null,
  user: { id: "u1", email: "a@b.com", name: "A", role: "viewer" },
});

describe("createSession", () => {
  it("sets expiresAt from getSessionMaxLifetimeMs()", async () => {
    vi.mocked(getSessionMaxLifetimeMs).mockReturnValue(60 * 60_000); // 1 hour
    mockPrisma.session.create.mockResolvedValue({});

    const before = Date.now();
    const { expiresAt } = await createSession("u1");
    const after = Date.now();

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 60 * 60_000);
    expect(mockPrisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", expiresAt }) })
    );
  });

  it("revokes every other active session for the user in the same transaction as the create (single session per account)", async () => {
    mockPrisma.session.create.mockResolvedValue({});

    await createSession("u1");

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: "superseded" },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Both operations must be in the one $transaction([...]) call, not fired
    // separately — otherwise a login racing this one could slip a second
    // live session through between the two writes.
    const [transactionArg] = mockPrisma.$transaction.mock.calls[0];
    expect(transactionArg).toHaveLength(2);
  });

  it("stores no idToken when none is provided (password login)", async () => {
    mockPrisma.session.create.mockResolvedValue({});

    await createSession("u1");

    expect(encryptSecret).not.toHaveBeenCalled();
    expect(mockPrisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idToken: null }) })
    );
  });

  it("encrypts and stores idToken when provided (SSO login)", async () => {
    mockPrisma.session.create.mockResolvedValue({});

    await createSession("u1", { idToken: "raw-id-token" });

    expect(encryptSecret).toHaveBeenCalledWith("raw-id-token");
    expect(mockPrisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idToken: "encrypted:raw-id-token" }) })
    );
  });
});

describe("getSessionUser", () => {
  it("returns null without querying the DB for an empty token", async () => {
    expect(await getSessionUser("")).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no session matches", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);
    expect(await getSessionUser("token")).toBeNull();
  });

  it("returns null for a revoked session", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ revokedAt: new Date() }));
    expect(await getSessionUser("token")).toBeNull();
  });

  it("returns null for an absolutely expired session", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await getSessionUser("token")).toBeNull();
  });

  it("revokes and returns null once idle time exceeds the configured timeout", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    mockPrisma.session.findUnique.mockResolvedValue(
      baseSession({ lastActivityAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 1000) })
    );
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    const user = await getSessionUser("token");

    expect(user).toBeNull();
    // revokeSession() does an updateMany filtered on revokedAt: null
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) })
    );
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });

  it("does not idle-expire when idle timeout is disabled (0), regardless of inactivity", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(0);
    mockPrisma.session.findUnique.mockResolvedValue(
      baseSession({ lastActivityAt: new Date(Date.now() - 60 * 60_000) })
    );

    const user = await getSessionUser("token");

    expect(user).toEqual({ id: "u1", email: "a@b.com", name: "A", role: "viewer" });
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("never writes lastActivityAt — only touchSessionActivity() is allowed to", async () => {
    // This is the property that matters most: getSessionUser() runs on every
    // authenticated request, including passive background polling the user
    // never triggered (e.g. GlobalHeader's periodic alert check). If it wrote
    // lastActivityAt too, that alone would keep the session "active" forever
    // regardless of whether the user is actually there.
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    mockPrisma.session.findUnique.mockResolvedValue(
      baseSession({ lastActivityAt: new Date(Date.now() - 1000) })
    );

    const user = await getSessionUser("token");

    expect(user).not.toBeNull();
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });
});

describe("getSessionOwner", () => {
  it("returns null without querying the DB for an empty token", async () => {
    expect(await getSessionOwner("")).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no session row matches at all", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);
    expect(await getSessionOwner("token")).toBeNull();
  });

  it("returns the user even for a revoked session", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ revokedAt: new Date() }));
    expect(await getSessionOwner("token")).toEqual({
      user: { id: "u1", email: "a@b.com", name: "A", role: "viewer" },
      idToken: null,
    });
  });

  it("returns the user even for an absolutely expired session", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await getSessionOwner("token")).toEqual({
      user: { id: "u1", email: "a@b.com", name: "A", role: "viewer" },
      idToken: null,
    });
  });

  it("returns the user even for an idle-expired session — unlike getSessionUser()", async () => {
    // This is the whole point: an idle-timeout-triggered logout call arrives
    // at the exact instant getSessionUser() would itself revoke the session,
    // so logout must be able to identify the account without going through
    // that validity gate.
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    mockPrisma.session.findUnique.mockResolvedValue(
      baseSession({ lastActivityAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 1000) })
    );

    expect(await getSessionOwner("token")).toEqual({
      user: { id: "u1", email: "a@b.com", name: "A", role: "viewer" },
      idToken: null,
    });
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("decrypts and returns the session's id_token when present", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ idToken: "encrypted:raw-id-token" }));

    const owner = await getSessionOwner("token");

    expect(decryptSecret).toHaveBeenCalledWith("encrypted:raw-id-token");
    expect(owner?.idToken).toBe("raw-id-token");
  });

  it("returns null idToken (without throwing) when decryption fails", async () => {
    vi.mocked(decryptSecret).mockRejectedValueOnce(new Error("bad key"));
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ idToken: "encrypted:raw-id-token" }));

    const owner = await getSessionOwner("token");

    expect(owner?.idToken).toBeNull();
    expect(owner?.user).toEqual({ id: "u1", email: "a@b.com", name: "A", role: "viewer" });
  });
});

describe("touchSessionActivity", () => {
  it("does nothing for an empty token", async () => {
    await touchSessionActivity("");
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("bumps lastActivityAt for the matching, non-revoked session", async () => {
    await touchSessionActivity("token");

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String), revokedAt: null },
      data: { lastActivityAt: expect.any(Date) },
    });
  });
});

describe("peekSessionExpiry", () => {
  it("returns null when idle timeout is disabled", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(0);
    expect(await peekSessionExpiry("token")).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an empty token", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    expect(await peekSessionExpiry("")).toBeNull();
  });

  it("returns null when the session is missing or revoked", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    mockPrisma.session.findUnique.mockResolvedValue(null);
    expect(await peekSessionExpiry("token")).toBeNull();

    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ revokedAt: new Date() }));
    expect(await peekSessionExpiry("token")).toBeNull();
  });

  it("returns the idle deadline when it comes before the absolute expiry", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    const lastActivityAt = new Date();
    mockPrisma.session.findUnique.mockResolvedValue(
      baseSession({ lastActivityAt, expiresAt: new Date(Date.now() + 60 * 60_000) })
    );

    const expiry = await peekSessionExpiry("token");

    expect(expiry?.getTime()).toBe(lastActivityAt.getTime() + IDLE_TIMEOUT_MS);
  });

  it("returns the absolute expiry when it comes before the idle deadline", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    const expiresAt = new Date(Date.now() + 30_000); // sooner than a fresh idle deadline
    mockPrisma.session.findUnique.mockResolvedValue(baseSession({ lastActivityAt: new Date(), expiresAt }));

    const expiry = await peekSessionExpiry("token");

    expect(expiry?.getTime()).toBe(expiresAt.getTime());
  });

  it("never writes lastActivityAt (read-only, unlike getSessionUser)", async () => {
    vi.mocked(getSessionIdleTimeoutMs).mockReturnValue(IDLE_TIMEOUT_MS);
    mockPrisma.session.findUnique.mockResolvedValue(
      baseSession({ lastActivityAt: new Date(Date.now() - 60 * 60_000) })
    );

    await peekSessionExpiry("token");

    expect(mockPrisma.session.update).not.toHaveBeenCalled();
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });
});
