# decryptField accepts a shortened authentication tag

**Status:** open · opened 2026-11-11

Found in review of #286, which removed the same lenient hex decode from `verifySignature`.
`decryptField` in `src/lib/security/crypto.ts` splits `iv:tag:ciphertext` and decodes each part
with `Buffer.from(part, "hex")`, which stops at the first non-hex character. It then passes
whatever length came out to `setAuthTag`. Probed on Node 22: a tag cut to 8 hex characters, or 8
good characters followed by a non-hex one, still decrypts. A 4-byte tag is accepted, so forging a
ciphertext would take about 2^32 tries rather than 2^128.

Nothing is exposed today: `decryptField` has no caller in `src/`, and its input would be a value
this server wrote, not one read from a request. It was left out of #286 because that fix was
scoped to the session signature. The first feature that calls `decryptField` on anything a client
can influence inherits this.

The fix is small: refuse a payload unless the IV is exactly 24 lowercase hex characters, the tag
exactly 32 and the ciphertext an even number of hex characters, and pass `authTagLength: 16` to
`createDecipheriv`.

`verifyPassword` decodes the stored key the same way. That value comes from `User.passwordHash`,
`Sponsor.passwordHash` or a stored `inviteTokenHash`, never from a request, and a shortened copy
fails the length check against the 64-byte derived key, so no change is proposed there.

**Settles when:** `decryptField` refuses a short or non-hex IV and tag with a test for each, or
the function is deleted as unused.
