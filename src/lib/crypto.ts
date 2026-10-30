import crypto from 'crypto';

// Legacy format (values encrypted before the GCM migration): salt(16) + iv(16) + ciphertext,
// no version byte. Kept for decrypt-only backward compatibility with existing DB rows.
const LEGACY_ALGORITHM = 'aes-256-cbc';
const GCM_ALGORITHM = 'aes-256-gcm';
const GCM_VERSION = 0x01;
const GCM_SALT_LEN = 16;
const GCM_IV_LEN = 12;
const GCM_AUTH_TAG_LEN = 16;

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required');
  return key;
}

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function encryptSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(GCM_SALT_LEN);
  const key = await scryptAsync(getEncryptionKey(), salt, 32);
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([GCM_VERSION]), salt, iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a secret encrypted by `encryptSecret`. Values are either the
 * current versioned AES-256-GCM format (integrity-checked; throws on any
 * tampering or wrong key) or, for values written before this migration, the
 * legacy unauthenticated AES-256-CBC format. Never falls back to returning
 * the raw input on failure — callers must treat a thrown error as "this
 * secret is unusable", not silently use invalid data.
 */
export async function decryptSecret(encryptedSecret: string): Promise<string> {
  const data = Buffer.from(encryptedSecret, 'base64');

  if (data[0] === GCM_VERSION) {
    let offset = 1;
    const salt = data.subarray(offset, offset + GCM_SALT_LEN);
    offset += GCM_SALT_LEN;
    const iv = data.subarray(offset, offset + GCM_IV_LEN);
    offset += GCM_IV_LEN;
    const authTag = data.subarray(offset, offset + GCM_AUTH_TAG_LEN);
    offset += GCM_AUTH_TAG_LEN;
    const encrypted = data.subarray(offset);

    const key = await scryptAsync(getEncryptionKey(), salt, 32);
    const decipher = crypto.createDecipheriv(GCM_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  const salt = data.subarray(0, 16);
  const iv = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const key = await scryptAsync(getEncryptionKey(), salt, 32);
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
