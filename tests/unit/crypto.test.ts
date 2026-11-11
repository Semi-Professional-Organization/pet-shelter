import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signPayload,
  verifySignature,
  encryptField,
  decryptField,
} from "@/lib/security/crypto";

describe("Cryptographic Primitives & Security", () => {
  describe("Password Hashing & Verification (scrypt + timingSafeEqual)", () => {
    it("should generate a valid salt:derivedKey hash format", async () => {
      const password = "SuperSecretShelterPassword123!";
      const hash = await hashPassword(password);

      expect(hash).toBeTypeOf("string");
      const parts = hash.split(":");
      expect(parts).toHaveLength(2);

      const [salt, key] = parts;
      // 16 bytes salt = 32 hex characters
      expect(salt).toHaveLength(32);
      expect(/^[0-9a-f]+$/i.test(salt)).toBe(true);

      // 64 bytes derived key = 128 hex characters
      expect(key).toHaveLength(128);
      expect(/^[0-9a-f]+$/i.test(key)).toBe(true);
    });

    it("should produce different salts and hashes for identical passwords across invocations", async () => {
      const password = "AdminPassword456$";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toEqual(hash2);
      const [salt1] = hash1.split(":");
      const [salt2] = hash2.split(":");
      expect(salt1).not.toEqual(salt2);
    });

    it("should verify correct password returns true", async () => {
      const password = "StaffSecureAccess#2026";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should verify incorrect password returns false", async () => {
      const password = "CorrectPassword123";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword("WrongPassword123", hash);
      expect(isValid).toBe(false);
    });

    it("should handle complex unicode, emojis, and very long passwords", async () => {
      const complexPass = "🐾 Shelter-Passphrase-Üñîçødé-2026-🚀✨".repeat(3);
      const hash = await hashPassword(complexPass);

      expect(await verifyPassword(complexPass, hash)).toBe(true);
      expect(await verifyPassword(complexPass + "!", hash)).toBe(false);
    });

    it("should gracefully return false for malformed stored hash strings without crashing", async () => {
      const malformedHashes = [
        "",
        "singlepartwithoutcolon",
        "too:many:colons:in:hash:string",
        "invalid_hex_salt:abcdef123456",
        "salt:",
        ":key",
        "1234:5678", // incorrect lengths
      ];

      for (const badHash of malformedHashes) {
        const result = await verifyPassword("somePassword", badHash);
        expect(result).toBe(false);
      }
    });
  });

  describe("HMAC-SHA256 Signing & Tampering Detection", () => {
    it("should generate a deterministic 64-character hex signature for a given payload", () => {
      const payload = "session-user-12345:ADMIN";
      const sig1 = signPayload(payload);
      const sig2 = signPayload(payload);

      // Lowercase only: verifySignature compares strings, so the case is part of the token.
      expect(sig1).toMatch(/^[0-9a-f]{64}$/);
      expect(sig1).toEqual(sig2);
    });

    it("should produce distinct signatures for distinct payloads", () => {
      const sig1 = signPayload("user-1");
      const sig2 = signPayload("user-2");
      expect(sig1).not.toEqual(sig2);
    });

    it("should verify authentic signature successfully", () => {
      const payload = '{"userId":"staff-1","role":"COORDINATOR"}';
      const signature = signPayload(payload);

      expect(verifySignature(payload, signature)).toBe(true);
    });

    it("should detect payload tampering and return false", () => {
      const originalPayload = '{"userId":"staff-1","role":"STAFF"}';
      const signature = signPayload(originalPayload);

      // Attacker attempts privilege escalation
      const tamperedPayload = '{"userId":"staff-1","role":"ADMIN"}';
      expect(verifySignature(tamperedPayload, signature)).toBe(false);

      // Minor single character alteration
      expect(verifySignature(originalPayload + " ", signature)).toBe(false);
    });

    it("should detect signature tampering and return false", () => {
      const payload = "sensitive-transaction-token";
      const validSig = signPayload(payload);

      // Flip the last character in the hex signature
      const lastChar = validSig.slice(-1);
      const alteredChar = lastChar === "a" ? "b" : "a";
      const tamperedSig = validSig.slice(0, -1) + alteredChar;

      expect(verifySignature(payload, tamperedSig)).toBe(false);
    });

    it("should safely return false for malformed signatures (wrong length, invalid hex, empty)", () => {
      const payload = "test-payload";
      const invalidSignatures = [
        "",
        "short-sig",
        "0".repeat(63), // 63 chars instead of 64
        "0".repeat(65), // 65 chars
        "zzzz".repeat(16), // non-hex string
        "undefined",
        "null",
      ];

      for (const badSig of invalidSignatures) {
        expect(verifySignature(payload, badSig)).toBe(false);
      }
    });

    // #286: Buffer.from(sig, "hex") stops at the first non-hex character, drops an odd
    // trailing character and ignores case, so most of these used to decode to the real
    // signature's bytes and verify. (63 characters, a leading space and a 0x prefix were
    // already refused; they are here so the table states the whole rule.) One signed
    // payload must have exactly one valid token.
    describe("accepts only the exact signature string (#286)", () => {
      const payload = '{"userId":"staff-1","role":"COORDINATOR"}';
      const validSig = signPayload(payload);

      it.each([
        ["a trailing 0", (sig: string) => `${sig}0`],
        ["a trailing zz", (sig: string) => `${sig}zz`],
        ["uppercase", (sig: string) => sig.toUpperCase()],
        ["one uppercase letter", (sig: string) => sig.replace(/[a-f]/, (c) => c.toUpperCase())],
        ["63 characters", (sig: string) => sig.slice(0, 63)],
        ["65 characters", (sig: string) => `${sig}${sig.slice(0, 1)}`],
        ["a trailing newline", (sig: string) => `${sig}\n`],
        ["a leading space", (sig: string) => ` ${sig}`],
        ["a trailing space", (sig: string) => `${sig} `],
        ["a 0x prefix", (sig: string) => `0x${sig}`],
      ])("rejects the real signature with %s", (_label, alter) => {
        const altered = alter(validSig);
        expect(altered).not.toBe(validSig);
        expect(verifySignature(payload, altered)).toBe(false);
      });

      // Without the typeof guard a Buffer, Uint8Array or DataView of the same characters
      // hashes like the string and verifies; a String object or undefined throws instead.
      const nonStrings = (text: string): [string, unknown][] => {
        const bytes = Buffer.from(text, "utf8");
        return [
          ["a Buffer", bytes],
          ["a Uint8Array", new Uint8Array(bytes)],
          ["a DataView", new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)],
          ["a String object", new String(text)],
          ["undefined", undefined],
        ];
      };

      it.each(nonStrings(validSig))("refuses the real signature passed as %s", (_label, value) => {
        expect(verifySignature(payload, value as string)).toBe(false);
      });

      it.each(nonStrings(payload))("refuses the real payload passed as %s", (_label, value) => {
        expect(verifySignature(value as string, validSig)).toBe(false);
      });
    });
  });

  describe("AES-256-GCM Field Encryption & Decryption", () => {
    it("should encrypt plain text into IV:AuthTag:Ciphertext format", () => {
      const plainText = "Secret applicant SSN or notes: 123-45-6789";
      const encrypted = encryptField(plainText);

      expect(encrypted).toBeTypeOf("string");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);

      const [ivHex, authTagHex, cipherHex] = parts;
      // 12 bytes IV = 24 hex characters
      expect(ivHex).toHaveLength(24);
      // 16 bytes AuthTag = 32 hex characters
      expect(authTagHex).toHaveLength(32);
      // Ciphertext hex is non-empty
      expect(cipherHex.length).toBeGreaterThan(0);
    });

    it("should produce unique ciphertexts and IVs for the same input on repeated encryptions", () => {
      const text = "Same confidential string";
      const enc1 = encryptField(text);
      const enc2 = encryptField(text);

      expect(enc1).not.toEqual(enc2);
      const [iv1] = enc1.split(":");
      const [iv2] = enc2.split(":");
      expect(iv1).not.toEqual(iv2);
    });

    it("should correctly round-trip decrypt plain text", () => {
      const inputs = [
        "Simple string",
        "",
        "Multiline\nText\r\nWith\tTabs and spaces!",
        "Special symbols: ~`!@#$%^&*()_+-=[]{}\\|;:'\",.<>/?",
        "Unicode & Emojis: 🐕 Hope Shelter 🐾 🐱 2026-08-15 中文 日本語",
        JSON.stringify({ applicant: "Jane Doe", notes: "Prefers high energy dogs", score: 98.5 }),
      ];

      for (const text of inputs) {
        const encrypted = encryptField(text);
        const decrypted = decryptField(encrypted);
        expect(decrypted).toBe(text);
      }
    });

    it("should detect corrupted ciphertext and return null", () => {
      const text = "Confidential shelter notes";
      const encrypted = encryptField(text);
      const [iv, authTag, cipher] = encrypted.split(":");

      // Flip character in ciphertext
      const corruptedCipher = (cipher[0] === "a" ? "b" : "a") + cipher.slice(1);
      const tampered = `${iv}:${authTag}:${corruptedCipher}`;

      expect(decryptField(tampered)).toBeNull();
    });

    it("should detect corrupted authentication tag and return null", () => {
      const text = "Confidential shelter notes";
      const encrypted = encryptField(text);
      const [iv, authTag, cipher] = encrypted.split(":");

      // Flip character in authentication tag
      const corruptedAuthTag = (authTag[0] === "a" ? "b" : "a") + authTag.slice(1);
      const tampered = `${iv}:${corruptedAuthTag}:${cipher}`;

      expect(decryptField(tampered)).toBeNull();
    });

    it("should detect corrupted IV and return null", () => {
      const text = "Confidential shelter notes";
      const encrypted = encryptField(text);
      const [iv, authTag, cipher] = encrypted.split(":");

      // Flip character in IV
      const corruptedIV = (iv[0] === "a" ? "b" : "a") + iv.slice(1);
      const tampered = `${corruptedIV}:${authTag}:${cipher}`;

      expect(decryptField(tampered)).toBeNull();
    });

    it("should safely return null for malformed payloads without unhandled exceptions", () => {
      const malformedPayloads = [
        "",
        "single-segment",
        "iv:onlytwo",
        "four:segments:in:payload:string",
        "not_hex_iv:not_hex_tag:not_hex_cipher",
        "garbage-input-data",
      ];

      for (const badPayload of malformedPayloads) {
        expect(decryptField(badPayload)).toBeNull();
      }
    });
  });
});
