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
 * | `development` / `test`   | return a clearly-labelled dev default and warn once         |
 *
 * "Weak" covers four cases: unset (or whitespace), *equal to the documented
 * development default* (which catches an `.env.example` value copied verbatim
 * into a real deploy), equal to a value listed in `published`, and shorter than
 * `minLength`.
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
   * Values this repository has published, **already lower-cased**, refused in
   * production whatever their length; the configured value is lower-cased to
   * match. Checked before `allowShort`, so a short published value is refused,
   * not waived.
   */
  published?: ReadonlySet<string>;
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
const PUBLISHED_INVITE_CODES: ReadonlySet<string> = new Set(
  ["HOPE2026", "1234", ...PUBLISHED_STAFF_PASSWORDS].map((code) => code.toLowerCase())
);

/** Minimum length for the HMAC key that signs every session cookie. */
const SESSION_SECRET_MIN_LENGTH = 32;

const warnedSecrets = new Set<string>();

const NONE_PUBLISHED: ReadonlySet<string> = new Set();

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Why a configured value is unacceptable. `short` is the only kind `allowShort` waives. */
type Weakness = { kind: "unset" | "dev-default" | "published" | "short"; description: string };

/**
 * Describes why a configured value is unacceptable, or `null` when it is fine.
 * The description never includes the value itself — these strings reach logs.
 */
function describeWeakness(
  value: string,
  devDefault: string,
  minLength: number,
  published: ReadonlySet<string>
): Weakness | null {
  if (value.length === 0) return { kind: "unset", description: "not set" };
  // Exact, as it always was. Matching case variants too would be a new way to
  // refuse the boot for every secret, which is the outage this policy change
  // is meant to remove; `published` is case-insensitive because it is new.
  if (value === devDefault) {
    return { kind: "dev-default", description: "still set to the documented development default" };
  }
  if (published.has(value.toLowerCase())) {
    return { kind: "published", description: "set to a value this repository publishes" };
  }
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
  const raw = (process.env[name] ?? "").trim();
  // Quote marks alone (`""`, `''`) are what someone types into a hosting
  // dashboard meaning "empty". Read them as unset rather than as a two-character
  // value that `allowShort` would accept.
  const value = /^["']*$/.test(raw) ? "" : raw;
  const weakness = describeWeakness(value, opts.devDefault, minLength, opts.published ?? NONE_PUBLISHED);

  if (!weakness) return value;

  if (opts.allowShort && weakness.kind === "short") {
    // Only the length is wrong, and for this secret the operator may choose that.
    warnOnce(
      `${name}:${weakness.kind}`,
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
    `${name}:${weakness.kind}`,
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
  });
}

/** Shared secret accepted by the legacy `admin_session` cookie. */
export function getAdminSecretKey(): string {
  return resolveSecret("ADMIN_SECRET_KEY", {
    devDefault: DEV_SECRET_DEFAULTS.ADMIN_SECRET_KEY,
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
