import crypto from "node:crypto";
import { getSessionSecret } from "@/lib/security/secrets";

// Resolved at module load so a production boot with a missing, weak, or
// still-default SESSION_SECRET fails immediately instead of signing cookies
// with a key published in this repository. See @/lib/security/secrets.
const SESSION_SECRET = getSessionSecret();
const ENCRYPTION_KEY = crypto.createHash("sha256").update(SESSION_SECRET).digest(); // 32 bytes key for AES-256
const IV_LENGTH = 12; // 12 bytes for GCM

/**
 * Derives a cryptographically strong scrypt hash for password storage.
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Constant-time password verification to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parts = storedHash.split(":");
      if (parts.length !== 2) return resolve(false);

      const [salt, key] = parts;
      const keyBuffer = Buffer.from(key, "hex");

      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return resolve(false);
        // timingSafeEqual prevents timing attacks
        if (derivedKey.length !== keyBuffer.length) return resolve(false);
        resolve(crypto.timingSafeEqual(derivedKey, keyBuffer));
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Generates an HMAC-SHA256 signature for a given payload string.
 */
export function signPayload(payload: string): string {
  const hmac = crypto.createHmac("sha256", SESSION_SECRET);
  hmac.update(payload);
  return hmac.digest("hex");
}

/**
 * Verifies that a signed payload has not been tampered with.
 *
 * The signature must be the exact string `signPayload` produces, so the two strings are
 * compared as strings. Decoding the caller's copy first is what made this lenient:
 * `Buffer.from(x, "hex")` stops at the first non-hex character, drops an odd trailing
 * character and ignores case, so `${sig}0`, `${sig}zz` and an uppercase copy all decoded
 * to the right bytes and many token strings counted as one (#286).
 */
export function verifySignature(payload: string, signature: string): boolean {
  // The types say string, but a caller that destructures a malformed token can pass
  // anything at runtime. A Buffer holding the same characters hashes to the same digest
  // as the string, which would be a second accepted form of one token.
  if (typeof payload !== "string" || typeof signature !== "string") return false;
  return timingSafeCompare(signature, signPayload(payload));
}

/**
 * Constant-time comparison of two secret strings (invite codes, shared keys).
 *
 * Both sides are hashed first so the comparison always runs over equal-length
 * buffers: `crypto.timingSafeEqual` throws on a length mismatch, and bailing
 * out early on length would leak the secret's size.
 */
export function timingSafeCompare(actual: string, expected: string): boolean {
  const actualDigest = crypto.createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

/**
 * Encrypts sensitive text using AES-256-GCM.
 */
export function encryptField(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text encrypted via AES-256-GCM.
 */
export function decryptField(encryptedPayload: string): string | null {
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || encryptedHex === undefined) return null;

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Generates a URL-safe, cryptographically random token.
 *
 * Used for staff invitation links. The raw value is emailed once and never
 * stored; only `hashPassword(token)` is persisted, so a database disclosure
 * does not yield usable invitations.
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}
