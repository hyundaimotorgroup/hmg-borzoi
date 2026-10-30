import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeCrypto from "crypto";
import { encryptSecret, decryptSecret } from "../crypto";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-for-crypto-spec";
});

afterEach(() => {
  process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

// Mirrors the pre-GCM-migration format decryptSecret still accepts:
// salt(16) + iv(16) + aes-256-cbc ciphertext, no version byte. CBC is
// intentional here — it's a test-only stand-in for data written before the
// GCM migration (see crypto.ts's LEGACY_ALGORITHM), never used to encrypt
// anything real; all production encryption goes through encryptSecret(),
// which is AES-256-GCM.
function legacyEncrypt(secret: string, encryptionKey: string): Buffer {
  const salt = nodeCrypto.randomBytes(16);
  const key = nodeCrypto.scryptSync(encryptionKey, salt, 32);
  const iv = nodeCrypto.randomBytes(16);
  const cipher = nodeCrypto.createCipheriv("aes-256-cbc", key, iv); // NOSONAR: typescript:S5542 — legacy-format test fixture only, see comment above
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([salt, iv, encrypted]);
}

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret through the current AES-256-GCM format", async () => {
    const encrypted = await encryptSecret("super-secret-value");
    expect(await decryptSecret(encrypted)).toBe("super-secret-value");
  });

  it("produces different ciphertext for the same input on each call (random salt/iv)", async () => {
    const a = await encryptSecret("same-value");
    const b = await encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("decrypts a legacy AES-256-CBC value (pre-GCM-migration format)", async () => {
    const legacy = legacyEncrypt("old-secret", process.env.ENCRYPTION_KEY!).toString("base64");
    expect(await decryptSecret(legacy)).toBe("old-secret");
  });

  it("throws rather than returning garbage when the key is wrong (GCM auth tag check)", async () => {
    const encrypted = await encryptSecret("super-secret-value");
    process.env.ENCRYPTION_KEY = "a-completely-different-key";
    await expect(decryptSecret(encrypted)).rejects.toThrow();
  });

  it("throws on tampered GCM ciphertext instead of silently decrypting", async () => {
    const encrypted = await encryptSecret("super-secret-value");
    const bytes = Buffer.from(encrypted, "base64");
    bytes[bytes.length - 1] ^= 0xff; // flip a bit in the ciphertext
    await expect(decryptSecret(bytes.toString("base64"))).rejects.toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", async () => {
    delete process.env.ENCRYPTION_KEY;
    await expect(encryptSecret("value")).rejects.toThrow("ENCRYPTION_KEY");
  });
});
