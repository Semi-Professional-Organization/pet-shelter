/**
 * Single resolution point for authentication secrets.
 *
 * No other module reads `process.env` for a secret: every consumer goes through
 * `resolveSecret` (or one of the named accessors below) so that one policy —
 * documented in `docs/tasks/TARGET_SECRET_HARDENING.md` §2 — applies everywhere.
 *
 * Policy, keyed on `NODE_ENV`:
 *
 * | Environment              | Missing / weak / known-default secret                      |
 * |--------------------------|------------------------------------------------------------|
 * | `production`             | throw — fail the boot loudly rather than serve forgeries    |
 * | `development` / `test`   | warn once per reason; an unset secret falls back to a dev   |
 * |                          | default, any other weak value is used as configured         |
 *
 * "Weak" covers four cases: unset (or nothing but whitespace, quote marks, the
 * backtick and invisible format characters), *equal
 * to the documented development default*, with or without surrounding quotes
 * (which catches an `.env.example` value copied verbatim into a real deploy),
 * equal to a value listed in `published`, and shorter than `minLength`.
 *
 * One exception: an accessor may pass `allowShort`, which turns "shorter than
 * `minLength`" alone into a warning. Only `STAFF_INVITE_SECRET` does. The other
 * three cases are refused regardless.
 *
 * This module imports nothing from the project except `./publishedPasswords`,
 * which itself imports nothing (layer L-B5): it sits below the rest of
 * `src/lib/security/` and must stay importable from any layer, server or
 * client-adjacent, without dragging dependencies in.
 */

import { PUBLISHED_STAFF_PASSWORDS } from "./publishedPasswords";

/** Raised when a secret cannot be resolved safely in production. */
export class SecretConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretConfigurationError";
  }
}

export interface ResolveSecretOptions {
  /**
   * The value used in development and test when the variable is unset. It is
   * also a *rejected* value in production — publishing it here is what lets
   * `resolveSecret` recognise an unchanged copy-paste deploy.
   */
  devDefault: string;
  /** Minimum acceptable length for a configured value. Defaults to 16. */
  minLength?: number;
  /**
   * When true, a configured value shorter than `minLength` is *accepted* in
   * production, with a warning recommending `minLength`. A missing value, the
   * development default and a `published` value are still refused: none of them
   * is a length the operator chose.
   */
  allowShort?: boolean;
  /**
   * Values this repository has published, refused in production whatever their
   * length, with or without outer quotes. Compared case-insensitively when
   * `allowShort` is set (a code typed by hand), exactly otherwise (a key).
   * Checked before `allowShort`, so a short published value is refused, not
   * waived.
   */
  published?: readonly string[];
}

/**
 * Development fallbacks. These are intentionally long, self-describing, and
 * useless as credentials: any deploy still carrying one refuses to boot.
 */
export const DEV_SECRET_DEFAULTS = {
  SESSION_SECRET: "dev-only-insecure-session-secret-change-me-before-deploy",
  ADMIN_SECRET_KEY: "dev-only-insecure-admin-secret-key-change-me",
  STAFF_INVITE_SECRET: "dev-only-insecure-staff-invite-code-change-me",
} as const;

/**
 * Values this repository published for these secrets in the past: placeholders
 * from earlier versions of `.env.example`, and the hardcoded fallbacks the source
 * used before `3b43293` (still printed in `docs/tasks/TARGET_SECRET_HARDENING.md`).
 * Still in git history, so still public: a deploy must not boot on one.
 */
const PUBLISHED_PLACEHOLDERS: readonly string[] = [
  "replace-me-with-a-random-32-plus-character-secret",
  "generate-a-secure-random-32-character-secret-key-here",
  "replace-me-with-a-random-admin-secret-key",
  "generate-a-secure-admin-secret-key-here",
  "replace-me-with-a-random-staff-invite-code",
  "hope-for-strays-secret-key-32-chars-long-secure-salt!",
  "hope_shelter_admin_secret_key_2026",
];

/**
 * Every documented development default and every published placeholder. Passed as
 * `published` to all three accessors, so one secret's default pasted into
 * another's slot (the wrong `.env.example` line), or an old placeholder, is
 * refused, not just a secret's own current default.
 */
const PUBLISHED_DEFAULTS: readonly string[] = [
  ...Object.values(DEV_SECRET_DEFAULTS),
  ...PUBLISHED_PLACEHOLDERS,
];

/**
 * Invite codes this repository has published, as hardcoded literals that once
 * bypassed the configured secret (`tests/unit/auth.test.ts` pins that they no
 * longer do). The 16-character minimum used to refuse them in production; with
 * `allowShort` it would not, so they are refused by name.
 *
 * The seeded staff passwords are refused too, from the one list that already
 * holds them (`./publishedPasswords`): they are 6-10 characters, so the old
 * minimum refused them as well.
 *
 * Deliberately only values the app once *accepted as credentials*. Every string
 * in a public repository is readable, test fixtures included, and no list can
 * hold them all; that is what the length recommendation is for.
 */
const PUBLISHED_INVITE_CODES: readonly string[] = [
  "HOPE2026",
  "1234",
  ...PUBLISHED_STAFF_PASSWORDS,
  // Every documented development default, so another secret's default pasted
  // into the invite slot, or this one in another letter case, is refused too.
  // (The invite's own default is also refused by exact match, as for all.)
  ...PUBLISHED_DEFAULTS,
];

/** Minimum length for the HMAC key that signs every session cookie. */
const SESSION_SECRET_MIN_LENGTH = 32;

const warnedSecrets = new Set<string>();

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Why a configured value is unacceptable. `short` is the only kind `allowShort` waives. */
type Weakness = { kind: "unset" | "dev-default" | "published" | "short"; description: string };

/**
 * Characters a pasted value can carry at its edges without meaning them, as
 * Unicode properties rather than a list. `Quotation_Mark` is Unicode's own set of
 * every quotation mark: straight, curly, German low quotes, guillemets, CJK
 * corners, fullwidth. `Cf` is the invisible format characters (zero-width
 * spaces, word joiner, BOM). The backtick and whitespace are added by hand.
 *
 * Two lists were tried first. One named characters; the other used the
 * punctuation categories, which also took in every bracket and still missed the
 * fullwidth quotes. Each was caught by review.
 */
const EDGE_CLASS = String.raw`[\p{Quotation_Mark}\p{Cf}` + "`" + String.raw`\s]`;
const IS_EDGE = new RegExp(`^${EDGE_CLASS}$`, "u");

/**
 * The value with its edge characters removed, by scanning inward from each end
 * one code point at a time. Linear by construction. A regex `X+$` is not: it is
 * retried at every position of a long interior run, which took 80 seconds on a
 * 200,000-character value in testing.
 */
function stripEdges(value: string): string {
  const chars = [...value];
  let start = 0;
  let end = chars.length;
  while (start < end && IS_EDGE.test(chars[start])) start++;
  while (end > start && IS_EDGE.test(chars[end - 1])) end--;
  return chars.slice(start, end).join("");
}

/**
 * The one reading of a configured value, used for every secret so its quote
 * rules cannot drift apart.
 *
 * - `value` is what the app uses: the setting trimmed, and otherwise exact,
 *   quotes included. A value of nothing but quote marks and spaces (`""`, `"`,
 *   `" "`) is what someone types into a dashboard meaning "empty", so it reads as
 *   `""` (unset). No real secret is only quote marks.
 * - `unwrapped` has its edge characters removed (see `EDGE_CLASS`: quote marks,
 *   the backtick, invisible format characters and whitespace), paired or not.
 *   It is used only to *recognise* a published value pasted with quotes
 *   (`"HOPE2026"`, `""HOPE2026""`, `"HOPE2026`), never as the value, so an
 *   accepted secret is never altered.
 */
function readConfigured(raw: string): { value: string; unwrapped: string } {
  const trimmed = raw.trim();
  const unwrapped = stripEdges(trimmed);
  if (unwrapped === "") return { value: "", unwrapped: "" };
  return { value: trimmed, unwrapped };
}

/**
 * Describes why a configured value is unacceptable, or `null` when it is fine.
 * The description never includes the value itself — these strings reach logs.
 */
function describeWeakness(
  value: string,
  unwrapped: string,
  devDefault: string,
  minLength: number,
  published: readonly string[] = [],
  caseInsensitive = false
): Weakness | null {
  if (value.length === 0) return { kind: "unset", description: "not set" };
  // Exact in case, as it always was: matching case variants too would be a new
  // way to refuse the boot for every secret. But also with its outer quotes
  // removed, because `.env.example` publishes the default *inside* quotes, and
  // pasting that line's value verbatim left a session or admin key that anyone
  // can read in this repository. Refusing that boot is the point of the check.
  if (unwrapped === devDefault) {
    return { kind: "dev-default", description: "still set to the documented development default" };
  }
  // Both forms, as set and with its edge characters removed: a published value
  // that itself ended in a quote mark would otherwise never match. Letter case
  // is ignored only for a code someone types by hand (`allowShort`); for a key,
  // a case variant must not become a new way to refuse the boot.
  // NFKC first, so fullwidth or other compatibility forms typed through an
  // input method (a fullwidth HOPE2026) fold to the published value too.
  const fold = (v: string) => (caseInsensitive ? v.normalize("NFKC").toLowerCase() : v);
  const targets = [fold(value), fold(unwrapped)];
  if (published.some((p) => targets.includes(fold(p)))) {
    return { kind: "published", description: "set to a value this repository publishes" };
  }
  // Measured on the value as set, as before this policy changed. Measuring it
  // without its edge characters was tried and reverted: a genuinely random key
  // that happens to start or end with a quote mark then fell below its minimum
  // and refused the boot, and padding in the middle still counted anyway. A
  // length check cannot measure entropy; padding a key is an operator mistake.
  if (value.length < minLength) {
    return { kind: "short", description: `shorter than the required ${minLength} characters` };
  }
  return null;
}

/** Once per secret *and* reason, so an earlier warning cannot swallow a later, different one. */
function warnOnce(key: string, message: string): void {
  if (warnedSecrets.has(key)) return;
  warnedSecrets.add(key);
  console.warn(message);
}

/**
 * Resolves a secret from the environment under the policy described above.
 *
 * @throws {SecretConfigurationError} in production when the value is missing,
 * equal to the documented development default, equal to a `published` value,
 * or shorter than `minLength` — the last only when `allowShort` is not set.
 */
export function resolveSecret(name: string, opts: ResolveSecretOptions): string {
  const minLength = opts.minLength ?? 16;
  // Exact apart from trimming and the quotes-only rule. Stripping quotes from an
  // accepted value was tried for the invite code and reverted, because it
  // changed which code staff must type.
  const raw = process.env[name] ?? "";
  const { value, unwrapped } = readConfigured(raw);
  const described = describeWeakness(
    value,
    unwrapped,
    opts.devDefault,
    minLength,
    opts.published,
    opts.allowShort === true
  );
  // A value that is present but only quote marks, spaces or invisible characters
  // reads as unset, but saying "not set" would send an operator looking for a
  // missing variable that their dashboard plainly shows. Say what is there.
  const weakness =
    described?.kind === "unset" && raw.trim() !== ""
      ? { ...described, description: "set to only quote marks, spaces or invisible characters" }
      : described;

  // Whether this value is used rather than refused, computed once so the warning
  // below and the two accepting branches cannot drift apart.
  const accepted = !weakness || (opts.allowShort === true && weakness.kind === "short");

  // A value accepted *with* edge characters (see `stripEdges`): they are part of
  // it, so anyone entering it without them (staff typing the invite code, a
  // caller sending the admin key) is refused with nothing to say why. Say so
  // here, without the value, for every secret.
  if (accepted && unwrapped !== value) {
    warnOnce(
      // Keyed on the length too, so a rotation to another quoted code warns again.
      `${name}:quoted:${value.length}`,
      `[security/secrets] ${name} starts or ends with a quote mark or an invisible ` +
        `character, which is part of the value: anyone entering it must include it ` +
        `too. Check whether it was meant to be; a random key may legitimately end ` +
        `in one, and changing it would refuse every caller sending the old value.`
    );
  }

  if (!weakness) return value;

  if (accepted) {
    // Only the length is wrong, and for this secret the operator may choose that.
    // Keyed on the length too: rotating to a short code of a different length
    // without a redeploy (the accessor reads per call) warns again. A new code of
    // the same length does not; the value itself is never part of the key.
    warnOnce(
      `${name}:short:${value.length}`,
      `[security/secrets] ${name} is shorter than the recommended ${minLength} ` +
        `characters. It is accepted, but a short value is easier to guess.`
    );
    return value;
  }

  if (isProduction()) {
    const length = opts.allowShort
      ? `${minLength}+ characters recommended`
      : `at least ${minLength} characters`;
    throw new SecretConfigurationError(
      `${name} is ${weakness.description}. Set a unique, high-entropy ${name} (${length}) ` +
        `in the production environment. See .env.example.`
    );
  }

  // Only an unset value is replaced with the fallback; anything else is used as
  // configured, so say which, rather than claim a fallback that is not in use.
  const used =
    weakness.kind === "unset" ? "using an insecure development fallback" : "using it as configured";
  warnOnce(
    // Keyed on the length, like the other warnings, so a rotation warns again.
    // On the description, not the kind: "not set" and "only quote marks" share
    // the kind and the length, but are different things to tell an operator.
    `${name}:${weakness.description}:${value.length}`,
    `[security/secrets] ${name} is ${weakness.description}; ${used}. ` +
      `This configuration refuses to boot with NODE_ENV=production.`
  );

  return value.length === 0 ? opts.devDefault : value;
}

/** HMAC key for sealing the `hope_shelter_session` cookie (and the AES field key). */
export function getSessionSecret(): string {
  return resolveSecret("SESSION_SECRET", {
    devDefault: DEV_SECRET_DEFAULTS.SESSION_SECRET,
    minLength: SESSION_SECRET_MIN_LENGTH,
    published: PUBLISHED_DEFAULTS,
  });
}

/** Shared secret accepted by the legacy `admin_session` cookie. */
export function getAdminSecretKey(): string {
  return resolveSecret("ADMIN_SECRET_KEY", {
    devDefault: DEV_SECRET_DEFAULTS.ADMIN_SECRET_KEY,
    published: PUBLISHED_DEFAULTS,
  });
}

/**
 * Invite code required to register any staff account.
 *
 * Resolved per call rather than at module load, so rotating `STAFF_INVITE_SECRET`
 * takes effect without a redeploy. `assertSecretsConfigured()` covers the
 * fail-fast half; this accessor covers the rotation half.
 *
 * **Recommended: 16 or more random characters.** Shorter is accepted, with a
 * warning, because the owner decided the length is theirs to choose
 * (`tasks/decisions/2026-10-17-the-staff-invite-code-length-is-the-operators-call.md`).
 * A short code that failed the boot check used to take the *whole public site*
 * down, not just registration.
 *
 * Why 16 is still the recommendation: this single shared code is the only gate
 * on an account that can read applicant PII under PDPA 2010. `registerAction`
 * spends a `register:ip:` budget that holds nothing the caller controls
 * (`tasks/decisions/2026-09-08-rate-limit-keys-carry-no-attacker-supplied-value.md`),
 * but wherever that budget cannot run — see the ceiling on `getClientAddress()`,
 * which declines to trust a forwarding header no proxy vouches for — the code's
 * length is all that bounds guessing it.
 *
 * Still refused at boot: unset, because this policy fails fast on a missing
 * secret rather than on the first registration (`registerAction` would refuse
 * an empty submitted code anyway); and the development default and
 * `PUBLISHED_INVITE_CODES`, because this repository publishes them.
 *
 * ceiling: no lower bound on a configured code, so even one character boots.
 * The rate limit does not make up for it: `checkRateLimit` is a per-process Map,
 * so each warm serverless instance counts separately, and a botnet is bounded by
 * neither the per-address nor the per-email budget (see the ceiling in
 * `registerAction`). Upgrade path: let a weak code disable registration only,
 * not the boot (option 2 in the decision), or move the limiter to shared state.
 */
export function getStaffInviteSecret(): string {
  return resolveSecret("STAFF_INVITE_SECRET", {
    devDefault: DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET,
    allowShort: true,
    published: PUBLISHED_INVITE_CODES,
  });
}

/**
 * Validates every authentication secret in one pass, for the startup hook.
 *
 * Only `SESSION_SECRET` was previously checked at boot (resolved at module load
 * by `crypto.ts`). `ADMIN_SECRET_KEY` and `STAFF_INVITE_SECRET` are read lazily
 * per request, so a production deploy missing either booted green and failed on
 * the first upload or registration instead — the "runtime check per call"
 * failure mode that `TARGET_SECRET_HARDENING.md` §2 explicitly rejects, because
 * it surfaces when nobody is watching.
 *
 * Reports *every* misconfigured secret at once so a single deploy cycle fixes
 * them all, rather than revealing them one restart at a time.
 *
 * @throws {SecretConfigurationError} in production when any secret is unsafe.
 */
export function assertSecretsConfigured(): void {
  const failures: string[] = [];

  for (const accessor of [getSessionSecret, getAdminSecretKey, getStaffInviteSecret]) {
    try {
      accessor();
    } catch (error) {
      if (!(error instanceof SecretConfigurationError)) throw error;
      failures.push(error.message);
    }
  }

  if (failures.length === 0) return;

  throw new SecretConfigurationError(
    `Refusing to start: ${failures.length} authentication secret(s) unsafe for production.\n` +
      failures.map((failure) => `  - ${failure}`).join("\n")
  );
}

/**
 * Clears the "warned once" bookkeeping. Test-only, mirroring `resetUserStore()`:
 * production code has no reason to make a secret warn twice.
 */
export function resetSecretWarnings(): void {
  warnedSecrets.clear();
}
