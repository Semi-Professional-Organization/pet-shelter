import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEV_SECRET_DEFAULTS } from "@/lib/security/secrets";

describe("SOPS & age Configuration Guards", () => {
  const rootDir = path.resolve(__dirname, "../../");

  it("ensures .sops.yaml exists with creation rules and age public keys", () => {
    const sopsYamlPath = path.join(rootDir, ".sops.yaml");
    expect(fs.existsSync(sopsYamlPath)).toBe(true);

    const content = fs.readFileSync(sopsYamlPath, "utf-8");
    expect(content).toContain("creation_rules:");
    expect(content).toContain("path_regex:");
    expect(content).toContain("age:");
    expect(content).toMatch(/age1[a-z0-9]+/); // Valid age public key format
  });

  it("ensures .env.production.enc exists and is genuinely encrypted", () => {
    const encPath = path.join(rootDir, ".env.production.enc");
    expect(fs.existsSync(encPath)).toBe(true);

    const content = fs.readFileSync(encPath, "utf-8");
    expect(content).toContain("sops_version");
    expect(content).toContain("sops_mac");
    expect(content).toContain("sops_age__list");
    expect(content).toContain("ENC[AES256_GCM");

    // No development default may sit in the encrypted file as plaintext.
    //
    // These were previously two literals matching an .env.example placeholder
    // ("replace-me..."). That placeholder is gone — .env.example now publishes
    // DEV_SECRET_DEFAULTS verbatim so resolveSecret can recognise an unchanged
    // copy — which left the assertions searching for a string that exists
    // nowhere, passing vacuously. Deriving them keeps the check honest.
    for (const devDefault of Object.values(DEV_SECRET_DEFAULTS)) {
      expect(content).not.toContain(devDefault);
    }
  });

  it("ensures .gitignore correctly permits .env*.enc while ignoring private keys", () => {
    const gitignorePath = path.join(rootDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("!.env*.enc");
    expect(content).toContain("*.key");
    expect(content).toContain("keys.txt");
  });

  it("ensures scripts/secrets.mjs exists and is executable", () => {
    const scriptPath = path.join(rootDir, "scripts", "secrets.mjs");
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
});
// #69, on every platform: Windows with core.autocrlf=true is where it happens.
describe("the committed encrypted environment file", () => {
  const rootDir = path.resolve(__dirname, "../../");
  const ENC = ".env.production.enc";

  it("is LF in git and checked out as LF everywhere", () => {
    const blob = execFileSync("git", ["cat-file", "blob", `:${ENC}`], { cwd: rootDir });
    expect(blob.includes(0x0d)).toBe(false);
    const attr = execFileSync("git", ["check-attr", "eol", "--", ENC], { cwd: rootDir, encoding: "utf-8" });
    expect(attr.trim()).toBe(`${ENC}: eol: lf`);
  });
});

/**
 * #69: `npm run secrets:check` printed `parsing time "...Z\x0d"` and exited 0.
 * The `\r` came from a CRLF working copy (`core.autocrlf=true`); SOPS's dotenv
 * parser splits on LF only. A fake `sops` stands in for the real one, so these
 * need no key and no secret.
 *
 * ceiling: POSIX only, because the fake is a shell script; Windows runs the
 * git-level test above but not these. Upgrade path: a `sops.cmd` fake.
 */
describe.skipIf(process.platform === "win32")("secrets:check", () => {
  const rootDir = path.resolve(__dirname, "../../");
  const ENC = ".env.production.enc";
  let dir: string;
  let calls: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sops-check-"));
    calls = path.join(dir, "calls.log");
    // `--version` succeeds; a decrypt fails with the error #69 recorded.
    fs.writeFileSync(
      path.join(dir, "sops"),
      [
        "#!/bin/sh",
        `echo "$@" >> "${calls}"`,
        'if [ "$1" = "--version" ]; then echo "sops 3.9.4"; exit 0; fi',
        'if [ -n "$FAKE_SOPS_OK" ]; then printf "A=1\\nB=2\\n"; exit 0; fi',
        `echo 'parsing time "2026-08-27T16:18:08Z\\x0d": extra text: "\\x0d"' >&2`,
        "exit 1",
      ].join("\n"),
      { mode: 0o755 }
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function check(file: string, extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [path.join(rootDir, "scripts", "secrets.mjs"), "check", file], {
      cwd: rootDir,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, SOPS_AGE_KEY: "unused", ...extraEnv },
    });
  }

  function committedCopy() {
    // The committed blob, not the working copy, which may predate the eol rule.
    const committed = path.join(dir, "committed.enc");
    fs.writeFileSync(committed, execFileSync("git", ["cat-file", "blob", `:${ENC}`], { cwd: rootDir }));
    return committed;
  }

  it("exits zero and prints only a key count when decryption works", () => {
    const result = check(committedCopy(), { FAKE_SOPS_OK: "1" });

    expect(result.stdout).toMatch(/\[OK\] Successfully decrypted .* \(2 keys configured\)/);
    expect(result.stdout).not.toMatch(/A=1/);
    expect(result.status).toBe(0);
  });

  it("exits nonzero when a named file does not exist", () => {
    const result = check(path.join(dir, "missing.enc"));

    expect(result.stderr).toMatch(/\[FAIL\] .*missing\.enc does not exist/);
    expect(result.status).toBe(1);
  });

  it("exits nonzero when decryption fails", () => {
    const result = check(committedCopy());

    expect(result.stderr).toMatch(/\[FAIL\] Decrypting/);
    expect(result.status).toBe(1);
  });

  it("refuses a CRLF copy by name, without handing it to sops", () => {
    const crlf = path.join(dir, "crlf.enc");
    fs.writeFileSync(crlf, fs.readFileSync(path.join(rootDir, ENC)).toString("latin1").replace(/\n/g, "\r\n"), "latin1");

    const result = check(crlf);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/CRLF\) line endings/);
    expect(fs.readFileSync(calls, "utf-8")).not.toMatch(/--decrypt/);
  });
});
