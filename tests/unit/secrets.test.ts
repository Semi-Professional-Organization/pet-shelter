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

    // What someone enters in a hosting dashboard meaning "empty". No real code
    // is only quote marks, so reading these as unset changes no code.
    it.each(['""', "''", '"', '" "', "``"])("treats an invite code of only quote marks (%s) as unset", (code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is set to only quote marks/);
    });

    it.each(['"HOPE2026"', "'admin123'", '"Hope2026"', '""HOPE2026""', `"'HOPE2026'"`, '"HOPE2026', "admin123'"])("refuses a published code wrapped in quotes (%s)", (code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/publishes/);
    });

    // The same reading for every secret, so one mistake gets one diagnosis.
    // `.env.example` publishes each default inside quotes; pasting that value
    // verbatim used to boot production on a key anyone can read here.
    it.each([
      ["SESSION_SECRET", DEV_SECRET_DEFAULTS.SESSION_SECRET],
      ["ADMIN_SECRET_KEY", DEV_SECRET_DEFAULTS.ADMIN_SECRET_KEY],
      ["STAFF_INVITE_SECRET", DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET],
    ])("refuses %s set to its dev default with the quotes left on", (name, devDefault) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);
      vi.stubEnv(name, `"${devDefault}"`);

      expect(() => assertSecretsConfigured()).toThrow(new RegExp(`${name} is (still set to the documented|set to a value)`));
    });

    // The wrong `.env.example` line pasted into the wrong slot.
    it.each([
      ["SESSION_SECRET", DEV_SECRET_DEFAULTS.ADMIN_SECRET_KEY],
      ["ADMIN_SECRET_KEY", DEV_SECRET_DEFAULTS.SESSION_SECRET],
    ])("refuses %s set to another secret's dev default", (name, otherDefault) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);
      vi.stubEnv(name, otherDefault);

      expect(() => assertSecretsConfigured()).toThrow(new RegExp(`${name} is set to a value this repository publishes`));
    });

    it("reports a quotes-only admin key as not set, as for the invite code", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", '""');
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).toThrow(/ADMIN_SECRET_KEY is set to only quote marks/);
    });

    // Characters pasted from Word, Notion or a rendered page.
    const LDQ = String.fromCharCode(0x201c);
    const RDQ = String.fromCharCode(0x201d);
    const ZWSP = String.fromCharCode(0x200b);

    it("refuses a published code in curly quotes", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", `${LDQ}HOPE2026${RDQ}`);

      expect(() => assertSecretsConfigured()).toThrow(/publishes/);
    });

    // Unicode categories, not a list: every quotation style is recognised.
    it.each([
      ["German low quotes", String.fromCharCode(0x201e), String.fromCharCode(0x201c)],
      ["guillemets", String.fromCharCode(0xab), String.fromCharCode(0xbb)],
      ["single guillemets", String.fromCharCode(0x2039), String.fromCharCode(0x203a)],
      ["CJK corner brackets", String.fromCharCode(0x300c), String.fromCharCode(0x300d)],
      ["fullwidth quotes", String.fromCharCode(0xff02), String.fromCharCode(0xff02)],
      ["a word joiner", "", String.fromCharCode(0x2060)],
    ])("refuses a published code wrapped in %s", (_label, open, close) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", `${open}HOPE2026${close}`);

      expect(() => assertSecretsConfigured()).toThrow(/publishes/);
    });

    // Brackets are not quote marks: a bracketed code is a code, not unset, and
    // draws no "quote mark" warning.
    it.each(["[shelter-2026]", "(abc)"])("accepts a bracketed code as is, without a quote warning (%s)", (code) => {
      vi.stubEnv("STAFF_INVITE_SECRET", code);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(getStaffInviteSecret()).toBe(code);
      expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/quote mark/));
    });

    it.each(["q7z4", "abc-def_123", "a(b)c", "x'y"])("keeps an accepted code's interior punctuation (%s)", (code) => {
      vi.stubEnv("STAFF_INVITE_SECRET", code);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(getStaffInviteSecret()).toBe(code);
    });

    it("refuses a session dev default in curly quotes", () => {
      vi.stubEnv("SESSION_SECRET", `${LDQ}${DEV_SECRET_DEFAULTS.SESSION_SECRET}${RDQ}`);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);

      expect(() => assertSecretsConfigured()).toThrow(/SESSION_SECRET is still set to the documented/);
    });

    it.each([
      ["curly quotes", `${LDQ}${RDQ}`],
      ["a zero-width space", ZWSP],
    ])("treats an invite code of only %s as unset", (_label, code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is set to only quote marks/);
    });

    it("warns, without the value, that an accepted admin key keeps curly quotes", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", `${String.fromCharCode(0x201c)}${STRONG_ADMIN}${String.fromCharCode(0x201d)}`);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => assertSecretsConfigured()).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ADMIN_SECRET_KEY starts or ends with a quote mark/));
      expect(warn.mock.calls.flat().join(" ")).not.toContain(STRONG_ADMIN);
    });

    // An interior run of edge characters must not make stripping quadratic. The
    // linear scan takes about 7 ms here; the quadratic regex it replaced took 80 s.
    // The bound is far above the first and far below the second, so a slow CI
    // runner cannot make it flaky.
    it("reads a value with a long interior run of spaces in linear time", () => {
      vi.stubEnv("STAFF_INVITE_SECRET", "a" + " ".repeat(200_000) + "b");
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const started = performance.now();

      getStaffInviteSecret();
      expect(performance.now() - started).toBeLessThan(4000);
    });

    it("warns, without the value, that an accepted invite code keeps its quotes", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", '"MyLongInviteCode2026xx"');
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => assertSecretsConfigured()).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STAFF_INVITE_SECRET starts or ends with a quote mark/));
      expect(warn.mock.calls.flat().join(" ")).not.toMatch(/MyLongInviteCode/);
    });

    it("reads the invite code exactly, quotes included", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", '"q7z4"');
      vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => assertSecretsConfigured()).not.toThrow();
      expect(getStaffInviteSecret()).toBe('"q7z4"');
    });

    it.each([
      ["the admin key's default", DEV_SECRET_DEFAULTS.ADMIN_SECRET_KEY],
      ["the session secret's default", DEV_SECRET_DEFAULTS.SESSION_SECRET],
      ["its own default, upper-cased", DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET.toUpperCase()],
    ])("refuses %s as the invite code", (_label, code) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", code);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is set to a value this repository publishes/);
    });

    // A published value that itself ends in an edge character must still match:
    // stripping the configured value alone would never find it.
    it("refuses a published value that ends in a quote mark", () => {
      vi.stubEnv("PROBE_SECRET", "pass'word'");

      expect(() =>
        resolveSecret("PROBE_SECRET", {
          devDefault: DEV_DEFAULT,
          minLength: 4,
          published: ["pass'word'"],
        })
      ).toThrow(/publishes/);
    });

    it("still says a truly unset invite code is not set", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET is not set/);
    });

    // Placeholders earlier versions of .env.example published; still in git history.
    it.each([
      ["SESSION_SECRET", "replace-me-with-a-random-32-plus-character-secret"],
      ["SESSION_SECRET", "generate-a-secure-random-32-character-secret-key-here"],
      ["ADMIN_SECRET_KEY", "replace-me-with-a-random-admin-secret-key"],
      ["ADMIN_SECRET_KEY", "generate-a-secure-admin-secret-key-here"],
      ["STAFF_INVITE_SECRET", "replace-me-with-a-random-staff-invite-code"],
    ])("refuses %s set to the old placeholder %s", (name, placeholder) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);
      vi.stubEnv(name, placeholder);

      expect(() => assertSecretsConfigured()).toThrow(new RegExp(`${name} is set to a value this repository publishes`));
    });

    // Hardcoded fallbacks the source used before 3b43293; still in git history.
    it.each([
      ["SESSION_SECRET", "hope-for-strays-secret-key-32-chars-long-secure-salt!"],
      ["ADMIN_SECRET_KEY", "hope_shelter_admin_secret_key_2026"],
    ])("refuses %s set to its former hardcoded fallback", (name, fallback) => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);
      vi.stubEnv(name, fallback);

      expect(() => assertSecretsConfigured()).toThrow(new RegExp(`${name} is set to a value this repository publishes`));
    });

    it("refuses a published invite code typed in fullwidth characters", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      // HOPE2026 in fullwidth forms, built from code points.
      const fullwidth = [..."HOPE2026"].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join("");
      vi.stubEnv("STAFF_INVITE_SECRET", fullwidth);

      expect(() => assertSecretsConfigured()).toThrow(/publishes/);
    });

    it("still refuses a whitespace-only invite code", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", STRONG_ADMIN);
      vi.stubEnv("STAFF_INVITE_SECRET", "   ");

      expect(() => assertSecretsConfigured()).toThrow(/STAFF_INVITE_SECRET/);
    });

    // Length is measured on the value as set. Measuring it without edge
    // characters refused a random key that happens to end in a quote mark.
    it("still boots a random admin key that happens to end with a quote mark", () => {
      vi.stubEnv("SESSION_SECRET", STRONG_SESSION);
      vi.stubEnv("ADMIN_SECRET_KEY", "7d3e1a95c4820bf'");
      vi.stubEnv("STAFF_INVITE_SECRET", STRONG_INVITE);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => assertSecretsConfigured()).not.toThrow();
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

    it("falls back to the dev default for a quotes-only value, as the warning says", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", '""');

      expect(getStaffInviteSecret()).toBe(DEV_SECRET_DEFAULTS.STAFF_INVITE_SECRET);
    });

    it("says a published value is used as configured, not that a fallback is in use", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", "HOPE2026");

      expect(getStaffInviteSecret()).toBe("HOPE2026");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/publishes; using it as configured/));
      expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/fallback/));
    });

    it("warns again when the invite code is rotated to another quoted code", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", '"a-long-quoted-invite-code"');
      getStaffInviteSecret();
      vi.stubEnv("STAFF_INVITE_SECRET", '"another-quoted-invite-code-here"');
      getStaffInviteSecret();

      const quotedWarnings = warn.mock.calls.filter((c) => /starts or ends with a quote mark/.test(String(c[0])));
      expect(quotedWarnings).toHaveLength(2);
    });

    it("warns again when the invite code is rotated to a different short length", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", "twelve-chars");
      getStaffInviteSecret();
      vi.stubEnv("STAFF_INVITE_SECRET", "q7z");
      getStaffInviteSecret();

      const shortWarnings = warn.mock.calls.filter((c) => /shorter than the recommended/.test(String(c[0])));
      expect(shortWarnings).toHaveLength(2);
    });

    it("warns again when rotated from one published code to another", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", "HOPE2026");
      getStaffInviteSecret();
      vi.stubEnv("STAFF_INVITE_SECRET", "content123");
      getStaffInviteSecret();

      const published = warn.mock.calls.filter((c) => /publishes/.test(String(c[0])));
      expect(published).toHaveLength(2);
    });

    it("warns separately for an unset value and a quotes-only one", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);
      getStaffInviteSecret();
      vi.stubEnv("STAFF_INVITE_SECRET", '""');
      getStaffInviteSecret();

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STAFF_INVITE_SECRET is not set/));
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/set to only quote marks/));
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
      // Placeholders an operator replaces, not values: <your-code>, ..., $VAR,
      // ${VAR}, $(command), and a shell comment ("# ..."). Narrow on purpose: a
      // real value may start with # or $ (#hope42), and that must still be checked.
      /^(<.*>|\.{3,}|\$[A-Z_][A-Z0-9_]*|\$\{[^}]+\}|\$\(.*|#)$/.test(value)
    );
  }

  const QUOTED_8_PLUS = /[`"']([^`"']{8,})[`"']/g;
  const QUOTED_16_PLUS = /[`"']([^`"']{16,})[`"']/g;
  /** `NAME=value` with no quotes, as in an env block in a runbook. */
  // A single `=` only: `===` and `=>` in a code sample are not assignments.
  const UNQUOTED_ASSIGNMENT = /\b([A-Z][A-Z0-9_]*)\s*=(?![=>])\s*([^\s"'`]+)/g;
  /** `NAME="value"` or `export NAME='value'`: an assignment, so read at any length. */
  const QUOTED_ASSIGNMENT = /\b([A-Z][A-Z0-9_]*)\s*=(?![=>])\s*(["'`])([^"'`]+)\2/g;

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
        // An assignment (`NAME=value`, quoted or not) is always a value, so it is
        // read at any length. A quoted token elsewhere may be prose ("strong",
        // "none"), so it is read only at 8+ characters, or 16+ on invite-code
        // lines, where any shorter quoted word would count as a code that boots.
        // ceiling: an invite code under 16 characters written in quotes inside a
        // sentence, not as an assignment, is not scanned.
        const values = [
          ...[...line.matchAll(name === "STAFF_INVITE_SECRET" ? QUOTED_16_PLUS : QUOTED_8_PLUS)].map(
            (m) => m[1]
          ),
          ...[...line.matchAll(UNQUOTED_ASSIGNMENT)].filter((m) => m[1] === name).map((m) => m[2]),
          ...[...line.matchAll(QUOTED_ASSIGNMENT)].filter((m) => m[1] === name).map((m) => m[3]),
        ];
        // A quoted assignment is matched by both quoted patterns; check it once.
        for (const value of new Set(values)) {
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
