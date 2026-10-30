import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptPassword/decryptPassword now delegate to '../crypto' (see index.ts) —
// this only needs to prove the delegation wasn't dropped in that refactor, not
// re-verify the AES-256-GCM implementation itself (covered by crypto.test.ts).
// Mocking prisma/clickhouse-client/etc. avoids pulling in a real DB connection
// just to import this module.
vi.mock("@clickhouse/client", () => ({ createClient: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: {} }));
vi.mock("../cache/credential-cache", () => ({ credentialCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock("../cache/client-pool", () => ({ clickHouseClientPool: { get: vi.fn(), set: vi.fn() } }));

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-for-reexport-spec";
});

afterEach(() => {
  process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("clickhouse/index encryptPassword/decryptPassword re-export", () => {
  it("round-trips through the shared crypto module's implementation", async () => {
    const { encryptPassword, decryptPassword } = await import("./index");
    const encrypted = await encryptPassword("cluster-password");
    expect(await decryptPassword(encrypted)).toBe("cluster-password");
  });
});
