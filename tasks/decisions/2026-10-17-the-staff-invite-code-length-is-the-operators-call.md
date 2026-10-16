# The staff invite code's length is the operator's call

**Decided:** 2026-10-17, by the owner.

## What happened

On 2026-10-17 the owner set a new `STAFF_INVITE_SECRET` in Vercel, shorter than 16 characters,
and redeployed. `src/instrumentation.ts` runs `assertSecretsConfigured()` at startup, which
refused the value. **Every page on the public site then returned HTTP 500**, not just
registration. The runtime log read "Refusing to start: 1 authentication secret(s) unsafe for
production".

## The choice

The owner was offered three options:

1. Leave the code alone and set 16+ characters.
2. Keep the minimum, but make a weak code disable only staff sign-up rather than the site.
3. Accept a short code with a warning.

They chose **3**: the length is theirs to decide.

`getStaffInviteSecret()` now passes `allowShort` to `resolveSecret`. A configured value shorter
than 16 characters boots, and the log carries a warning recommending 16. The warning never
includes the value.

## What it does not change

- **An unset, whitespace-only or quote-marks-only (`""`) code is still refused at boot.** The secret policy fails fast
  on a missing secret, rather than on the first registration. (`registerAction` would refuse an
  empty submitted code anyway; an earlier draft gave that as the reason, which was wrong.)
- **The development default is still refused at boot, by exact match, as before.** It is
  published in this repository. A case-insensitive match was tried and reverted: it would have
  been a new way for the session and admin secrets to refuse the boot, the outage this change
  exists to remove.
- **Published credentials are refused as the invite code, in any letter case.** These are the
  legacy invite codes `HOPE2026` and `1234`, plus the seeded staff passwords (`admin123` and
  the rest, from `src/lib/security/publishedPasswords.ts`). The 16-character minimum was the
  only thing refusing them in production; code review caught both groups. They are listed in
  `PUBLISHED_INVITE_CODES` and checked before the short waiver.
- **`SESSION_SECRET` (32) and `ADMIN_SECRET_KEY` (16) keep their minimums.** Only the invite code
  passes `allowShort`.

## What this reverses, and the risk accepted

The 2026-09-08 decisions kept the 16-character minimum deliberately: "this single shared code is
the only gate on an account that can read applicant PII under PDPA 2010".

**The rate limit does not bound guessing a short code in production.** `checkRateLimit` is a
per-process `Map`. On Vercel each warm instance counts separately, and the ceiling in
`registerAction` already says a botnet is bounded by neither the per-address nor the per-email
budget. A first draft of this entry said production's exposure was "bounded by the rate
limit"; code review caught that as wrong.

An example of the scale: a 4-digit code has 10,000 values. An attacker with 100 addresses at 10
attempts a minute each, before counting extra instances, covers that in about ten minutes.

There is no lower bound. Even a one-character code boots. Registration only ever yields
`STAFF`, but that role can read applicant PII. The owner accepted this risk; the recommendation
stays at 16 or more random characters.

## Declined, with reasons

- **A minimum length below 16** (for example 6 or 8): it contradicts the owner's choice that the
  length is theirs.
- **Letting a weak code disable only registration, not the boot** (option 2): the better design
  for the blast radius, and it would compose with this one, but it was not the owner's choice.
  It is the upgrade path named in the `ceiling:` comment on `getStaffInviteSecret`, together
  with moving the rate limiter to shared state. Until then, any *other* weak secret still takes
  the whole site down at boot.
- **Scanning quoted words shorter than 8 characters in operator files:** a quoted word may be
  prose ("strong", "none"). A 4-character floor was tried, and review showed it would fail the
  guard on prose. So a short invite code written in quotes inside a sentence is not scanned; one
  on an unquoted `NAME=value` line is, at any length. The ceiling is stated where it is set.
- **A deny-list of variants of the published codes** (`HOPE2026!`, `HOPE2027`, `12345`): no
  list catches every derivation, and the length recommendation is the defence.
- **Refusing every short string the repository contains**, such as test fixtures: no list can
  hold every string in a public repository. `PUBLISHED_INVITE_CODES` holds the values the app
  once *accepted as credentials*, and the length recommendation covers the rest.

## Evidence

- `tests/unit/secrets.test.ts`:
  - a 4-character code boots and warns without its value;
  - the dev default, a whitespace-only code, `HOPE2026`, `1234`, `hope2026`, `admin123`,
    `STAFF123` and `vol123` are refused;
  - a session secret that is only a case variant of its dev default still boots;
  - `ADMIN_SECRET_KEY` keeps its minimum;
  - an earlier "not set" warning no longer swallows a later "short" one.
- The `.env.example` check and the operator-file guard both call the app's real accessors, so
  neither can drift from the app's policy. The guard reads quoted values of 8+ characters and
  unquoted `NAME=value` lines of any length, skipping placeholders such as `<your-code>`.
- A probe planted five lines in a runbook:

  | Planted line | Result |
  |---|---|
  | 8-character code, unquoted env line | caught |
  | 3-character code, unquoted env line | caught |
  | "strong" as a quoted prose word | no false alarm |
  | `<your-code>`, `...`, `<paste-generated-key-here>` placeholders | no false alarm |
  | 4-character code, backticked in prose | not scanned (the stated ceiling) |
  | 6-character code, quoted in prose | not scanned (the stated ceiling) |
- A production build started with a 4-character code served `/`, `/faq`, `/pets` and
  `/admin/login` with 200, and its log carried the warning without the value. Started with
  `HOPE2026` or with the development default, it refused to boot.
- Mutants, all killed:

  | Mutant | Tests failed |
  |---|---|
  | invite accessor without `allowShort` | 2 |
  | every weakness waived, not only `short` | 20 |
  | `allowShort` applied to every secret | 2 |
  | published codes not passed to the invite accessor | 8 |
  | published check skipped, so the short waiver takes them | 8 |
  | staff passwords left out of the invite deny list | 3 |
  | published codes compared case-sensitively | 4 |
  | a quotes-only value read as a two-character code | 2 |
  | dev default compared case-insensitively (a new boot refusal) | 1 |
  | development warning claims a fallback for a configured value | 1 |
  | warnings keyed on the name alone (the swallowed-warning bug) | 1 |
