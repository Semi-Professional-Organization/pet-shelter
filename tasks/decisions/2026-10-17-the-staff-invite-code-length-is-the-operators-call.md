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

- **An unset or whitespace-only code is still refused at boot.** So is a value of nothing but
  quote marks and spaces (`""`, `"`, `" "`), which is what someone types into a dashboard
  meaning "empty". One reader (`readConfigured`) applies this to every secret, so a
  quotes-only admin key is also "not set", and in development the fallback really is used. The secret policy fails fast on a missing secret, rather than on the first
  registration. (`registerAction` would refuse an empty submitted code anyway; an earlier draft
  gave that as the reason, which was wrong.)
- **An accepted code is read exactly as set, quotes included**, like every other secret.
  Stripping surrounding quotes was tried for one round and reverted: it changed which code
  staff must type for any existing code that starts and ends with a quote. Quotes are removed
  only when *matching* the deny list: any leading and trailing quote marks, paired or not, so
  a published code pasted as `"HOPE2026"`, `""HOPE2026""` or `"HOPE2026` is still refused.
  "Quote marks" means Unicode's own `Quotation_Mark` property: every quotation style,
  including curly, German low, guillemets, CJK corners and fullwidth. It also covers invisible
  format characters (zero-width spaces, word joiner, BOM), the backtick and whitespace.
  Brackets are not quote marks, and a code's interior punctuation is untouched. Two attempts
  came first and were corrected by review: a hand-written list, which each review found
  another style missing from, and the punctuation categories, which missed fullwidth quotes
  and took in every bracket. An invite code accepted with outer quotes
  logs a warning, without the value, because staff typing it without them are refused. That never alters an accepted code. Its cost is that a quoted development default,
  which booted before this change, is now refused.
- **The development default is still refused at boot, by exact match, as before**, and now
  also with its outer quotes removed, for all three secrets. `.env.example` publishes each
  default inside quotes, so pasting that value verbatim used to boot production on a session
  or admin key anyone can read in this repository. The gap predates this change. It was found
  in review because this change claimed one quote rule for every secret. A case-insensitive
  match was tried and reverted: it would have
  been a new way for the session and admin secrets to refuse the boot, the outage this change
  exists to remove.
- **Published credentials are refused as the invite code, in any letter case.** These are the
  legacy invite codes `HOPE2026` and `1234`, plus the seeded staff passwords (`admin123` and
  the rest, from `src/lib/security/publishedPasswords.ts`). The 16-character minimum was the
  only thing refusing them in production; code review caught both groups. They are listed in
  `PUBLISHED_INVITE_CODES` and checked before the short waiver. The list also holds every
  documented development default, so another secret's default pasted into the invite slot, or
  the invite's own default in another letter case, is refused.
- **Length is measured on the value as set, as before.** Measuring it without the edge
  characters was tried for one round and reverted. It refused a genuinely random key that
  happens to start or end with a quote mark, which is the outage this change removes, and
  padding in the middle of a value still counted. A length check cannot measure entropy, and
  padding a key with invisible characters is an operator mistake, not an attack.
- **`SESSION_SECRET` (32) and `ADMIN_SECRET_KEY` (16) keep their minimums.** Only the invite code
  passes `allowShort`. Review found two older gaps in them, both fixed here: each accepted
  *another* secret's dev default (the wrong `.env.example` line), and its own default with the
  quotes left on. Both are now refused. That is a new boot refusal, correct because such a
  deployment runs on a key anyone can read, and the open entry asks for the production values
  to be checked before deploying. For keys the match is exact in letter case; only the invite
  code, typed by hand, is matched case-insensitively, so no case variant of a key becomes a new
  way to fail the boot.

## What this reverses, and the risk accepted

**This reverses** the "16-character minimum stays" conclusion of
`tasks/decisions/2026-09-08-review-corrected-three-of-the-same-days-security-decisions.md`,
which stays as written because it was true when written.

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
  the whole site down at boot. Tracked in
  `tasks/open/one-weak-secret-still-takes-the-whole-site-down.md`.
- **Scanning quoted words shorter than 8 characters in operator files:** a quoted word may be
  prose ("strong", "none"). A 4-character floor was tried, and review showed it would fail the
  guard on prose. So a short invite code written in quotes inside a sentence is not scanned; one
  on an unquoted `NAME=value` line is, at any length. The ceiling is stated where it is set.
- **Refusing CI's `SESSION_SECRET`** (`ci-only-...` in `.github/workflows/ci.yml`). It is
  public, but the Playwright job seals its own admin session cookie with it, so refusing it
  would break CI whenever that job runs a production server. The value's name says what it
  is for.
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
  assignments (`NAME=value`, `NAME="value"`, `export NAME='value'`) of any length, skipping
  placeholders such as `<your-code>` and `$(command)`, and code such as `===` and `=>`. On
  invite-code lines, quoted tokens outside an assignment are read only at 16+ characters,
  because a shorter quoted prose word there ("offboarding") would otherwise count as a code
  that boots. A long code written in prose is still caught; one of 8-15 characters is not, and
  that is the stated ceiling.
- A probe planted lines in a runbook:

  | Planted line | Result |
  |---|---|
  | invite code in an assignment, unquoted, 3 or 8 characters | caught |
  | invite code in an assignment, quoted, 4 or 6 characters | caught |
  | "strong" as a quoted prose word | no false alarm |
  | `<your-code>`, `...`, `<paste-generated-key-here>` placeholders | no false alarm |
  | 24-character invite code backticked in prose | caught |
  | "offboarding" quoted on an invite-code line | no false alarm |
  | `=== undefined`, `=> rotate` | no false alarm |
  | 4-character code, backticked in prose, not an assignment | not scanned (the stated ceiling) |
- A production build started with a 4-character code served `/`, `/faq`, `/pets` and
  `/admin/login` with 200, and its log carried the warning without the value. Started with
  `HOPE2026` or with the development default, it refused to boot.
- Mutants, all 33 killed, against the committed code:

  | Mutant | Tests failed |
  |---|---|
  | no NFKC normalisation before case folding | 1 |
  | former hardcoded fallbacks not refused | 2 |
  | dev warning keyed on the kind, not the description | 1 |
  | placeholders left out of the published defaults | 7 |
  | quotes-only value reported as not set | 9 |
  | published check skipped | 37 |
  | published value not matched with its edges removed | 14 |
  | published value matched only with its edges removed | 1 |
  | dev warning keyed without the length | 2 |
  | all warnings keyed on the name alone (the swallowed-warning bug) | 5 |
  | length measured without edge characters (refuses a random key) | 1 |
  | no warning for an accepted quoted value | 3 |
  | quoted warning for the invite code only | 1 |
  | every weakness waived, not only short | 49 |
  | allowShort applied to every secret | 2 |
  | quotes-only no longer read as unset | 10 |
  | edges not stripped for matching | 31 |
  | edge stripping quadratic again | 17 |
  | quotation marks not recognised | 13 |
  | brackets treated as quote marks | 2 |
  | invisible format characters not recognised | 2 |
  | quoted warning keyed without the length | 1 |
  | dev defaults left out of the invite deny list | 4 |
  | invite accessor without allowShort | 16 |
  | published codes not passed to the invite accessor | 28 |
  | staff passwords left out of the invite deny list | 6 |
  | other secrets' defaults not passed to session and admin | 8 |
  | invite code compared case-sensitively | 16 |
  | keys compared case-insensitively (new boot refusal) | 3 |
  | dev default compared case-insensitively (new boot refusal) | 2 |
  | dev default not matched with its quotes removed | 1 |
  | short warning keyed without the length | 1 |
  | development warning claims a fallback for a configured value | 1 |
