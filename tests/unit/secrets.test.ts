import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEV_SECRET_DEFAULTS,
  SecretConfigurationError,
  getAdminSecretKey,
  getSessionSecret,
  getStaffInviteSecret,
  resetSecretWarnings,
  assertSecretsConfigured,
  resolveSecret,
} from "@/lib/security/secrets";

const DEV_DEFAULT = "dev-only-insecure-test-secret-change-me";
const STRONG = "9f2c1d7a4b8e6035aa17cc93de40b52f7168e0d4";

describe("resolveSecret", () => {
  beforeEach(() => {
    resetSecretWarnings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("throws when the variable is unset", () => {
      vi.stubEnv("TEST_SECRET", undefined);

      expect(() => resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toThrow(
        SecretConfigurationError
      );
      expect(() => resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toThrow(
        /TEST_SECRET/
      );
    });

    it("throws when the variable is only whitespace", () => {
      vi.stubEnv("TEST_SECRET", "   ");

      expect(() => resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toThrow(
        SecretConfigurationError
      );
    });

    it("throws when the variable equals the documented development default", () => {
      vi.stubEnv("TEST_SECRET", DEV_DEFAULT);

      expect(() => resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toThrow(
        SecretConfigurationError
      );
    });

    it("throws when SESSION_SECRET is shorter than 32 characters", () => {
      vi.stubEnv("SESSION_SECRET", "too-short-for-an-hmac-key");

      expect(() => getSessionSecret()).toThrow(SecretConfigurationError);
      expect(() => getSessionSecret()).toThrow(/32/);
    });

    it("returns a strong value unchanged", () => {
      vi.stubEnv("TEST_SECRET", STRONG);

      expect(resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT, minLength: 32 })).toBe(STRONG);
    });

    it("returns a strong SESSION_SECRET unchanged", () => {
      vi.stubEnv("SESSION_SECRET", STRONG);

      expect(getSessionSecret()).toBe(STRONG);
    });

    it("never leaks the resolved value in the thrown message", () => {
      vi.stubEnv("TEST_SECRET", DEV_DEFAULT);

      try {
        resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT });
        expect.unreachable("resolveSecret should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SecretConfigurationError);
        expect((error as Error).message).not.toContain(DEV_DEFAULT);
      }
    });
  });

  describe("development and test", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("returns the dev default when unset and warns exactly once per secret", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("TEST_SECRET", undefined);

      expect(resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toBe(DEV_DEFAULT);
      expect(resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toBe(DEV_DEFAULT);
      expect(resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT })).toBe(DEV_DEFAULT);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("TEST_SECRET");
    });

    it("does not warn when a strong value is configured", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("TEST_SECRET", STRONG);

      expect(resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT, minLength: 32 })).toBe(STRONG);
      expect(warn).not.toHaveBeenCalled();
    });

    it("does not throw for a weak value, it degrades with a warning", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("TEST_SECRET", "short");

      expect(resolveSecret("TEST_SECRET", { devDefault: DEV_DEFAULT, minLength: 32 })).toBe("short");
    });

    it("still resolves in NODE_ENV=test without throwing", () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);

      expect(getStaffInviteSecret()).toBe(DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET);
    });
  });

  describe("named secret accessors", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("reads the environment on every call rather than caching at import time", () => {
      vi.stubEnv("ADMIN_SECRET_KEY", "first-admin-secret-key-value");
      expect(getAdminSecretKey()).toBe("first-admin-secret-key-value");

      vi.stubEnv("ADMIN_SECRET_KEY", "second-admin-secret-key-value");
      expect(getAdminSecretKey()).toBe("second-admin-secret-key-value");
    });

    it("trims surrounding whitespace from configured values", () => {
      vi.stubEnv("STAFF_INVITE_SECRET", "  padded-invite-code  ");
      expect(getStaffInviteSecret()).toBe("padded-invite-code");
    });

    it("exposes development defaults that are clearly labelled as insecure", () => {
      for (const value of Object.values(DEV_SECRET_DEFAULTS)) {
        expect(value).toMatch(/dev-only-insecure/);
      }
      // The HMAC key must satisfy its own minimum length even in development.
      expect(DEV_SECRET_DEFAULTS.SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    });

    it("does not resurrect the removed credential literals as defaults", () => {
      for (const value of Object.values(DEV_SECRET_DEFAULTS)) {
        expect(value).not.toBe("1234");
        expect(value).not.toBe("HOPE2026");
      }
    });
  });
});

describe("assertSecretsConfigured", () => {
  const STRONG_SESSION = "b41f8c02d97e653a1cf0a8b25d6e34917fa0c8b3e25d71f4";
  const STRONG_ADMIN = "7d3e1a95c4820bf6e73a1d05c9284fbe";
  const STRONG_INVITE = "e08b7c46193fa2d5b0e94c71a836df20";

  beforeEach(() => {
    resetSecretWarnings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("passes when all three secrets are strong", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).not.toThrow();
    });

    // The gap this function closes: only SESSION_SECRET was validated at boot,
    // so a deploy missing either of the other two started and failed later.
    it("throws when ADMIN_SECRET_KEY is unset even though the session secret is fine", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", undefined);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).toThrow(SecretConfigurationError);
      expect(() => assertSecretsConfigured()).toThrow(/ADMIN_SECRET_KEY/);
    });

    it("throws when STAFF_INVITE_SECRET is unset even though the others are fine", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET/);
    });

    // One deploy cycle should be enough to fix every problem.
    it("reports every misconfigured secret at once, not just the first", () => {
      vi.stubEnv("SESSION_SECRET", undefined);
      vi.stubEnv("ADMIN_SECRET_KEY", undefined);
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);

      let message = "";
      try {
        assertSecretsConfigured();
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/SESSION_SECRET/);
      expect(message).toMatch(/ADMIN_SECRET_KEY/);
      expect(message).toMatch(/STAFF_INVITE_SECRET/);
      expect(message).toMatch(/3 authentication secret\(s\)/);
    });

    it("rejects a dev default copied verbatim into production", () => {
      vi.stubEnv("SESSION_SECRET", DEV_SECRET_DEFAULTS.SESSION_SECRET);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).toThrow(/SESSION_SECRET/);
    });

    it("never puts a secret value into the failure message", () => {
      // Distinctive values that cannot collide with the message's own wording.
      vi.stubEnv("SESSION_SECRET", "zqxvw1");
      vi.stubEnv("ADMIN_SECRET_KEY", "jkmpq2");
      // A published code in an unusual case: short codes now boot, so this is
      // what makes the invite path fail and put its own line in the message.
      vi.stubEnv("STAFF_INVITE_SECRET", "HoPe2026");

      let message = "";
      try {
        assertSecretsConfigured();
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/STAFF_INVITE_SECRET is set to a value this repository publishes/);
      expect(message).not.toMatch(/zqxvw1/);
      expect(message).not.toMatch(/jkmpq2/);
      expect(message).not.toMatch(/hope2026/i);
    });

    // The invite code's length is the operator's call
    // (tasks/decisions/2026-10-17-the-staff-invite-code-length-is-the-operators-call.md).
    // A short one used to fail the boot check and take every public page down.
    it("boots with a 4-character staff invite code, and warns without the value", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", "q7z4");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => assertSecretsConfigured()).not.toThrow();
      expect(getStaffInviteSecret()).toBe("q7z4");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STAFF_INVITE_SECRET.*recommended 16/));
      expect(warn.mock.calls.flat().join(" ")).not.toMatch(/q7z4/);
    });

    it("still refuses the published development default as the invite code", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET/);
    });

    // Short, so allowShort alone would accept them; refused because this
    // repository publishes them, whatever the letter case.
    it.each(["HOPE2026", "1234", "hope2026"])("still refuses the published invite code %s", (code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is set to a value this repository publishes/);
    });

    // The seeded staff passwords are published too, and short enough that the
    // old minimum refused them. Reused from the one list that holds them.
    it.each(["admin123", "STAFF123", "vol123"])("refuses the published staff password %s as the invite code", (code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is set to a value this repository publishes/);
    });

    // Matching case variants of a dev default would be a new boot refusal for
    // every secret, the outage this policy change removes; it stays exact.
    it("still boots a session secret that is only a case variant of its dev default", () => {
      vi.stubEnv("SESSION_SECRET", DEV_SECRET_DEFAULTS.SESSION_SECRET.toUpperCase());
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).not.toThrow();
    });

    // What someone types into a hosting dashboard meaning "empty".
    it.each(['""', "''"])("treats an invite code of only quote marks (%s) as unset", (code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is not set/);
    });

    it("still refuses a whitespace-only invite code", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", "   ");

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET/);
    });

    it("keeps the length minimum for every other secret", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", "short-admin");
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).toThrow(/ADMIN_SECRET_KEY/);
    });
  });

  describe("development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("does not throw when secrets are unset, so local onboarding still works", () => {
      vi.stubEnv("SESSION_SECRET", undefined);
      vi.stubEnv("ADMIN_SECRET_KEY", undefined);
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => assertSecretsConfigured()).not.toThrow();
    });

    it("says a published value is used as configured, not that a fallback is in use", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", "HOPE2026");

      expect(getStaffInviteSecret()).toBe("HOPE2026");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/publishes; using it as configured/));
      expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/fallback/));
    });

    it("still warns that the invite code is short after warning that it was unset", () => {
      // warnOnce used to be keyed on the name alone, so the first warning
      // swallowed every later one for the same secret.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);
      getStaffInviteSecret();
      vi.stubEnv("STAFF_INVITE_SECRET", "q7z4");
      getStaffInviteSecret();

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not set/));
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/shorter than the recommended 16/));
    });

    it("surfaces the warning for each weak secret once, at startup", () => {
      vi.stubEnv("SESSION_SECRET", undefined);
      vi.stubEnv("ADMIN_SECRET_KEY", undefined);
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      assertSecretsConfigured();
      assertSecretsConfigured();

      expect(warn).toHaveBeenCalledTimes(3);
    });
  });
});

/**
 * `.env.example` is the file an operator copies into a real environment.
 *
 * `resolveSecret` recognises an unchanged copy by comparing the value against
 * its own `DEV_SECRET_DEFAULTS` — that is the entire mechanism, and it works
 * only while the two files publish the same strings. A placeholder unique to
 * `.env.example` (`"replace-me-with-a-random-32-plus-character-secret"`, 49
 * characters, which is what this file used to carry) clears every other rule:
 * it is set, it is not the dev default, and it is longer than the minimum. It
 * boots green in production while looking obviously fake to a human.
 *
 * These tests pin the two lists together so that hole cannot reopen.
 */
describe(".env.example authentication secrets", () => {
  const documented: Record<string, string> = {};

  {
    const raw = readFileSync(resolve(__dirname, "../../.env.example"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (line.trimStart().startsWith("#")) continue;
      const match = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
      if (match) documented[match[1]] = match[2];
    }
  }

  // Each with the app's own accessor, so the "refuses to boot" check below runs
  // the policy the app runs (including `allowShort` on the invite code) rather
  // than a second copy of it.
  const SECRETS = [
    ["SESSION_SECRET", DEV_SECRET_DEFAULTS.SESSION_SECRET, getSessionSecret],
    ["ADMIN_SECRET_KEY", DEV_SECRET_DEFAULTS.ADMIN_SECRET_KEY, getAdminSecretKey],
    ["STAFF_INVITE_SECRET", DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET, getStaffInviteSecret],
  ] as const;

  beforeEach(() => {
    resetSecretWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(SECRETS)("documents %s as the development default, not a novel placeholder", (name, devDefault) => {
    expect(documented[name]).toBe(devDefault);
  });

  it.each(SECRETS)("refuses to boot production with the documented %s", (name, _devDefault, accessor) => {
    expect(documented[name], `${name} is not documented in .env.example`).toBeDefined();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(name, documented[name]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => accessor()).toThrow(SecretConfigurationError);
  });

  it("names EMAIL_FROM rather than the unread SENDER_EMAIL", () => {
    // src/lib/email.ts and src/actions/settings.ts both read EMAIL_FROM. An
    // operator who sets the documented name instead leaves the From-address on
    // Resend's shared sandbox sender, which does not deliver to arbitrary
    // recipients — a silent failure with no error anywhere.
    expect(documented).toHaveProperty("EMAIL_FROM");
    expect(documented).not.toHaveProperty("SENDER_EMAIL");
  });
});

/**
 * `.env.example` is not the only file an operator copies a secret out of.
 *
 * The block above pins `.env.example` to `DEV_SECRET_DEFAULTS`. That closed one
 * of three copies. `docs/runbooks/OPERATIONAL_RUNBOOK.md` published
 * `SESSION_SECRET` as `"hope-for-strays-dev-secure-session-secret-key-32-chars-min"`
 * in a column headed "Default / Example", and
 * `docs/runbooks/RUNBOOK_PRODUCTION_MEDIA_STORAGE.md` published two more inside
 * an ```env block under "Verify Production Authentication & Security Variables".
 * All three were set, none was a `DEV_SECRET_DEFAULTS` entry, and all three
 * cleared their minimum length — so all three booted green in production while
 * signing session cookies with a value committed to this repository.
 *
 * AGENTS.md: "once two copies have diverged, that is the defect, fix both."
 * A guard that reads one file cannot see that, so this one reads every file an
 * operator is told to copy from, and asserts the real policy — `resolveSecret`
 * itself must refuse each published value under `NODE_ENV=production`.
 */
describe("no operator-facing file publishes a secret that boots in production", () => {
  // The app's own accessors, not a copy of their options, so this guard tests
  // exactly what production accepts. A short invite code now boots, so a
  // published one fails here; what the scan reads is set out in `collect`.
  const GUARDED = {
    SESSION_SECRET: getSessionSecret,
    ADMIN_SECRET_KEY: getAdminSecretKey,
    STAFF_INVITE_SECRET: getStaffInviteSecret,
  } as const;
  type GuardedName = keyof typeof GUARDED;
  const NAMES = Object.keys(GUARDED) as GuardedName[];

  const REPO_ROOT = resolve(__dirname, "../..");
  const RUNBOOKS = "docs/runbooks";

  /**
   * Discovered, not listed: a runbook added next week is copied from just as
   * readily as one added last month, and a hardcoded list would not cover it.
   */
  const OPERATOR_FILES = [
    ".env.example",
    "docs/setup.md",
    ...readdirSync(resolve(REPO_ROOT, RUNBOOKS))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `${RUNBOOKS}/${f}`),
  ];

  /**
   * A backticked or quoted token that is plainly prose, a path, or another
   * variable's name — not a value anyone would paste into an environment.
   * Without this the scan reports `assertSecretsConfigured()` as a 25-character
   * `ADMIN_SECRET_KEY`, which is noise, and noise is what gets a guard deleted.
   */
  function looksLikeCode(value: string): boolean {
    return (
      /[\s()]/.test(value) ||
      /^[A-Z][A-Z0-9_]*$/.test(value) ||
      value.includes("/") ||
      /\.(ts|tsx|mjs|js|json|md|env)$/.test(value) ||
      /^[A-Z][A-Za-z]+Error$/.test(value) ||
      // Placeholders an operator replaces, not values: <your-code>, ..., $VAR, #.
      /^(<.*>|\.{3,}|\$.*|#.*)$/.test(value)
    );
  }

  const QUOTED_8_PLUS = /[`"']([^`"']{8,})[`"']/g;
  /** `NAME=value` with no quotes, as in an env block in a runbook. */
  const UNQUOTED_ASSIGNMENT = /\b([A-Z][A-Z0-9_]*)\s*=\s*([^\s"'`]+)/g;

  type Published = { file: string; line: number; name: GuardedName; value: string };

  function collect(): Published[] {
    const out: Published[] = [];
    for (const file of OPERATOR_FILES) {
      const raw = readFileSync(resolve(REPO_ROOT, file), "utf8");
      raw.split(/\r?\n/).forEach((line, index) => {
        if (line.includes("ENC[")) return; // SOPS ciphertext, not a value
        const named = NAMES.filter((n) => line.includes(n));
        if (named.length !== 1) return; // a line listing several names states no value
        const name = named[0];
        // An unquoted `NAME=value` is always a value, so it is read at any length.
        // A quoted token may be prose ("strong", "none"), so it is read only at
        // 8+ characters. ceiling: a 4-7 character invite code written in quotes
        // inside a sentence is not scanned; one in an env block is.
        const values = [
          ...[...line.matchAll(QUOTED_8_PLUS)].map((m) => m[1]),
          ...[...line.matchAll(UNQUOTED_ASSIGNMENT)].filter((m) => m[1] === name).map((m) => m[2]),
        ];
        for (const value of values) {
          if (value === name || (NAMES as string[]).includes(value)) continue;
          if (looksLikeCode(value)) continue;
          out.push({ file, line: index + 1, name, value });
        }
      });
    }
    return out;
  }

  const published = collect();

  beforeEach(() => {
    resetSecretWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("finds the published values it is supposed to be checking", () => {
    // Without this, a scan that silently matches nothing is indistinguishable
    // from a repository with nothing to find, and every assertion below passes
    // vacuously. Seven as of 2026-09-04; asserting a floor, not a count, so a
    // new runbook does not fail this.
    expect(OPERATOR_FILES.length).toBeGreaterThanOrEqual(3);
    expect(published.length).toBeGreaterThanOrEqual(7);
    expect(published.map((p) => p.file)).toContain(".env.example");
    expect(published.map((p) => p.file)).toContain(`${RUNBOOKS}/OPERATIONAL_RUNBOOK.md`);
  });

  it.each(published.map((p) => [`${p.file}:${p.line} ${p.name}`, p] as const))(
    "%s is refused by its accessor under NODE_ENV=production",
    (_label, entry) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(entry.name, entry.value);

      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => GUARDED[entry.name]()).toThrow(SecretConfigurationError);
    }
  );
});
