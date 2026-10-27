# SOPS cannot decrypt the production environment file because its timestamp contains a carriage return

**Status:** open · opened 2026-09-06

`npm run secrets:check` printed:

```text
[FAIL] Decrypting .env.production.enc failed:
parsing time "2026-08-27T16:18:08Z\x0d": extra text: "\x0d"
```

The command nevertheless exited with status 0. The migration's byte-for-byte comparison means this is not evidence of ReFS or Robocopy corruption; the encrypted file and repository state were preserved from the source checkout.

It is asserted from the error, but not yet independently measured, that a carriage return reaches SOPS's timestamp parser. The two practical risks are that the documented flow cannot currently recover production secrets and that automation may accept a failed secrets check because the wrapper exits successfully.

Do not normalize or re-encrypt the only copy while diagnosing. Preserve a backup, confirm the intended line-ending/encryption format, and prove successful decryption with the configured age key before replacing anything. Never record decrypted values in this ledger or command output.

## 2026-10-27: cause found, two of three conditions met

Measured, not asserted: the committed blob of `.env.production.enc` holds **no** carriage return
(19 LF, 0 CR). The `\r` therefore comes from the working copy: `core.autocrlf=true` on the
owner's Windows checkout converts the file to CRLF, and SOPS's dotenv parser splits on LF only,
so `sops_lastmodified` keeps its `\r`. Nothing needs re-encrypting; the git copy is intact.

- `.gitattributes` now marks the file `text eol=lf`, so it is always checked out LF and a CRLF
  copy is normalised on `git add`. (`-text` was tried first; review found it let `git add` commit
  the CRLF bytes.)
- `scripts/secrets.mjs` refuses a CRLF copy by name in `check`, `decrypt-to-local` and `run`,
  with the restore command, and `check` exits 1 on any `[FAIL]`.
- `tests/unit/sopsConfig.test.ts` covers both with a fake `sops`, no key and no secret.

**Still open:** decrypting the real file with the configured age key. That needs the owner's key,
on the owner's machine: `git checkout HEAD -- .env.production.enc`, then `npm run secrets:check`
(it prints only a key count). Delete this entry when that passes.

**Settles when:** the existing production environment can be decrypted with the configured age key, `npm run secrets:check` exits nonzero on a decryption failure, and a secret-free regression test covers the relevant CRLF/timestamp case.
