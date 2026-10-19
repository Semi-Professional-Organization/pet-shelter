# Target — Authentication Secret Hardening

**Date**: 2026-08-19
**Branch**: `feat/tnrm-rehabilitation`
**Baseline**: 26 test files / 223 tests green · `npx tsc --noEmit` clean outside `scratch/`
**Predecessor commit**: `0bdb1b7 docs: add layer map and project guide, refresh the documentation portal`

> **Scope**: this document resolves open item **P1** in the
> [TNRM & Rehabilitation Sprint handoff](HANDOFF_TNRM_REHABILITATION_SPRINT.md), which recorded the
> secret fallbacks in a paragraph but left no plan. That document remains the authority on overall
> branch state and the full backlog; this one covers only the vulnerability, the decision, and the
> work that follows from it.
>
> Sibling target: [Persisting Pet History](HANDOFF_PET_HISTORY_PERSISTENCE.md) resolves P3. The two
> are independent and can proceed in either order — **this one should go first.**

---

## 1. 🔴 Why this is the next target

Every claim below was read from the source on the date above, not inherited from prose.

Four authentication secrets fall back to literals committed to the repository. That alone would be
serious. The reason it is *urgent* is that **the mitigation an operator would reasonably assume
works — setting the environment variable — does not close the main hole.**

| Secret | Location | Fallback | In `.env.example`? |
|---|---|---|:---:|
| `SESSION_SECRET` | `src/lib/security/crypto.ts:3` | `"hope-for-strays-secret-key-32-chars-long-secure-salt!"` | ✅ |
| `ADMIN_SECRET_KEY` | `src/lib/security/adminSession.ts` | `"hope_shelter_admin_secret_key_2026"` | ✅ |
| `STAFF_INVITE_SECRET` | `src/actions/auth.ts:15` | `"1234"` | ❌ **undocumented** |

### Exploit path A — self-registration exposes applicant PII

`registerAction` (`src/actions/auth.ts:100`) gates the invite code **only for elevated roles**:

```ts
if (role === ROLES.ADMIN || role === ROLES.COORDINATOR) {
  const inviteCode = (data.staffInviteCode || "").trim();
  if (inviteCode !== STAFF_INVITE_SECRET && inviteCode !== "HOPE2026" && inviteCode !== "1234") {
```

Two defects in four lines:

1. **`STAFF` requires no invite code at all**, and `role` defaults to `STAFF`. Anyone who can reach
   the Server Action can create a staff account.
2. **`"HOPE2026"` and `"1234"` are accepted unconditionally** — the comparison is `&&`-chained
   against the env var, so configuring `STAFF_INVITE_SECRET` correctly in production leaves both
   literals working. There is no configuration that disables them.

`STAFF` is not a decorative role. `src/actions/applications.ts:41` grants it `getApplications()`:

```ts
assertAuthorized(session, [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.STAFF]);
```

which returns every `AdoptionApplicationRecord` — **applicant name, email, phone, home address,
housing type, and household details**. For a Malaysian NGO this is personal data under **PDPA 2010**,
and the chain from "anonymous request" to "full applicant PII" has no secret in it whatsoever.

The error message compounds it by publishing a working credential:

```ts
error: `Staff invite code is required to register with '${role}' privileges. Use '1234' for demo.`
```

### Exploit path B — forged sessions and a bearer-token admin

- `SESSION_SECRET` seeds the HMAC that signs `hope_shelter_session`. Missing env var → cookies are
  signed with a key published in this repository, so a session for any `id`/`role` can be forged
  offline. It also derives `ENCRYPTION_KEY` (`sha256`) at `crypto.ts:4`.
- `verifyAdminSession()` (`src/lib/security/adminSession.ts`) returns `true` when the `admin_session` cookie
  **equals** `ADMIN_SECRET_KEY`. That is a static bearer token, not a session — one cookie set to a
  known literal yields admin, and it is the sole gate on `/api/upload`.

### Reachability

`registerAction` is exported from a `"use server"` module, so it is a live POST endpoint regardless
of UI. It also has a real caller at `src/lib/adminAuth.ts:99`. There is no `middleware.ts`, so no
edge guard sits in front of any of this.

---

## 2. 🧭 Decision: environment-aware, fail-fast in production

**Do not simply throw on a missing secret everywhere.** This codebase's defining property is that it
runs with zero setup — no `DATABASE_URL`, 223 tests green against in-memory fixtures. Hard-throwing
would break the test suite and local onboarding, and would be rejected on those grounds.

Instead, resolve every secret through one module with behaviour keyed to `NODE_ENV`:

| Environment | Missing / weak / known-default secret |
|---|---|
| `production` | **Throw at import time.** Fail the boot loudly rather than serving forgeable sessions. |
| `development`, `test` | Return a clearly-labelled dev default and `console.warn` **once** per secret. |

This mirrors the dual-layer store's philosophy — graceful in development, strict where it counts —
while inverting its worst trait: the store swallows errors silently, and this must not.

Rejecting the alternatives, briefly:

- **Runtime check per call** — the failure surfaces on a user's request instead of at deploy, which
  is exactly when nobody is looking.
- **Lint rule banning literal fallbacks** — catches the pattern, not the live `"HOPE2026"` bypass,
  and says nothing at deploy time.

---

## 3. 🛠️ Plan

### 3.1 New: `src/lib/security/secrets.ts`

Single resolution point. No other module reads `process.env` for a secret.

```ts
export function resolveSecret(name: string, opts: {
  devDefault: string;
  minLength?: number;
}): string
```

Throws in production when the variable is unset, shorter than `minLength`, or **equal to the
documented dev default** — that last case is what catches a `.env.example` value copied verbatim
into a real deploy. Exports `getSessionSecret()`, `getAdminSecretKey()`, `getStaffInviteSecret()`.

`SESSION_SECRET` carries `minLength: 32`; the README already claims that requirement and nothing
currently enforces it.

> **Superseded in part, 2026-10-17.** `resolveSecret` also takes `allowShort` and `published`.
> `getStaffInviteSecret()` passes both: a short invite code boots with a warning, and published
> credentials (the legacy codes `HOPE2026` and `1234`, and the seeded staff passwords) are refused
> at any length. The session and admin secrets keep their minimums, but are now also refused
> when set to any value this repository has published for a secret: any dev default, an old
> `.env.example` placeholder, or one of the hardcoded fallbacks in the table above, exactly or
> with its quotes left on. A value of only quote marks now reads as unset, for all three. See
> `tasks/decisions/2026-10-17-the-staff-invite-code-length-is-the-operators-call.md`.

### 3.2 Rewrite the invite guard — `src/actions/auth.ts`

1. **Delete** `&& inviteCode !== "HOPE2026" && inviteCode !== "1234"`. Unconditional literals are the
   defect; there is no configuration that makes them safe.
2. Compare with `crypto.timingSafeEqual` on equal-length buffers, consistent with `verifyPassword`.
3. **Require an invite code for every role**, not just `ADMIN`/`COORDINATOR`. A shelter has no
   anonymous-staff use case, and `STAFF` reads applicant PII.
4. Strip the credential from the error message.

> If open volunteer sign-up is a genuine product requirement, the correct shape is a `VOLUNTEER`-only
> path that grants no `assertAuthorized` role — not a default-`STAFF` registration. Confirm with the
> shelter before choosing; the code currently implements neither deliberately.

### 3.3 Point existing callers at the module

- `src/lib/security/crypto.ts:3` → `getSessionSecret()`
- `src/lib/security/adminSession.ts` → `getAdminSecretKey()`
- `src/actions/auth.ts:15` → `getStaffInviteSecret()`

### 3.4 Document the third secret

`STAFF_INVITE_SECRET` is absent from `.env.example` — an operator cannot set what they don't know
exists. Add it with all three marked as production-required.

### 3.5 Recommended follow-on, flagged not done

> **Raised 2026-08-28 as [`TARGET_LEGACY_ADMIN_TOKEN_REMOVAL.md`](TARGET_LEGACY_ADMIN_TOKEN_REMOVAL.md)**,
> dispatchable as `/remove-legacy-admin-token`. That audit found the branch is reachable only by
> hand: nothing in `src/` issues the cookie, so the "behavioural change" caveat below is weaker than
> it reads. The open question it carries is what becomes of `ADMIN_SECRET_KEY`, not the deletion.

The `admin_session` shared-secret branch in `verifyAdminSession()` is weak by construction: a static
bearer token with no expiry, no subject, and no revocation, guarding `/api/upload`. Hardening the
secret makes it *harder to guess*, not *sound*. Removing the branch entirely in favour of the signed
session is the right end state, but it is a behavioural change beyond this target — raise it
separately.

---

## 4. 🧪 Test coverage to require

New `tests/unit/secrets.test.ts`, manipulating `process.env.NODE_ENV` per case:

| Case | Expectation |
|---|---|
| production + unset | throws |
| production + equal to dev default | throws |
| production + `SESSION_SECRET` under 32 chars | throws |
| production + strong value | returns it |
| development + unset | returns dev default, warns once |

Extend `tests/unit/auth.test.ts`:

| Case | Expectation |
|---|---|
| `"HOPE2026"` with a different `STAFF_INVITE_SECRET` set | **rejected** — the regression that defines this work |
| `"1234"` likewise | rejected |
| `role: "STAFF"` with no invite code | rejected |
| correct code | succeeds, session established, audit log recorded |
| error message on failure | contains no credential |

---

## 5. ✅ Gate

- `npm test` green — 223 existing tests plus the new ones, **no existing test weakened to pass**
- `npx tsc --noEmit` clean outside `scratch/`
- `node docs/architecture/layer-graph.mjs` — report B still `(clean)` for all six actions; `secrets.ts`
  is L-B5 and must not import anything above it
- `tests/unit/layerBoundaries.test.ts` green
- Manual: `NODE_ENV=production npm run build` with secrets unset **fails loudly**, and succeeds with
  them set

---

## 6. ⚠️ Blockers and scope

- **Rotating `SESSION_SECRET` invalidates every live session** — all users are signed out on deploy.
  Acceptable, but announce it. `encryptField`/`decryptField` derive their AES key from the same
  secret; both are **currently uncalled**, so there is no data-at-rest migration. Verify that is
  still true before rotating.
- **Product decision needed** on §3.2 item 3: does the shelter want open volunteer sign-up? The
  work is otherwise unblocked — implement invite-for-all-roles and adjust if the answer is yes.
- **Do not** roll the `admin_session` removal (§3.5) into this change.
- `.env.local` exists in this working tree with real-looking values, but is **correctly ignored**
  (`.gitignore:34` → `.env*`) and untracked — verified, no repo exposure. The secrets at risk are the
  ones *hardcoded in tracked source*, listed in §1.
