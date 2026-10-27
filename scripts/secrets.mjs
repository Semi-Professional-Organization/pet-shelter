#!/usr/bin/env node
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Cross-platform helper to locate SOPS binary if not in global process.env.PATH
function findSopsBinary() {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "sops.exe" : "sops";

  // Check system PATH
  try {
    const checkCmd = isWindows ? "where sops" : "which sops";
    const result = execSync(checkCmd, { stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8" }).trim();
    if (result) return result.split(/\r?\n/)[0];
  } catch {}

  // Check common Windows fallback locations
  if (isWindows) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "sops.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages", "SecretsOPerationS.SOPS_Microsoft.Winget.Source_8wekyb3d8bbwe", "sops.exe"),
      path.join(process.env.ProgramData || "C:\\ProgramData", "chocolatey", "bin", "sops.exe"),
      path.join(process.env.USERPROFILE || "", "scoop", "shims", "sops.exe"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return binaryName;
}

const SOPS_BIN = findSopsBinary();

/**
 * Refuses an encrypted file that carries a carriage return. SOPS's dotenv parser
 * splits on LF only, so a CRLF checkout (`core.autocrlf=true` on Windows) leaves
 * `\r` on every value and decryption fails with `parsing time "...Z\x0d"`. The
 * committed blob is LF and `.gitattributes` keeps it so; this names the cause
 * for a working copy checked out before that rule. It never rewrites the file:
 * it is ciphertext, and the git blob is the copy to restore from.
 */
function lineEndingProblem(file) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (e) {
    return `${file} cannot be read: ${e.code ?? e.message}`;
  }
  if (!bytes.includes(0x0d)) return null;
  return (
    `${file} has Windows (CRLF) line endings in this working copy, which SOPS cannot parse.\n` +
    `       If git tracks it, the committed copy is fine; restore it (keep a copy first if you edited it),\n` +
    `       running each command on its own (git skips the file without the first):\n` +
    `         git rm --cached -q "${file}"\n` +
    `         git checkout HEAD -- "${file}"`
  );
}

/** Exits 1 with the line-ending diagnosis before a CRLF file reaches `sops`. */
function refuseCrlf(file) {
  const problem = lineEndingProblem(file);
  if (!problem) return;
  console.error(problem);
  process.exit(1);
}

function parseDotenv(content) {
  const env = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function checkAgeKey() {
  if (process.env.SOPS_AGE_KEY) {
    return { found: true, location: "Environment Variable (SOPS_AGE_KEY)" };
  }
  if (process.env.SOPS_AGE_KEY_FILE && fs.existsSync(process.env.SOPS_AGE_KEY_FILE)) {
    return { found: true, location: process.env.SOPS_AGE_KEY_FILE };
  }
  const appDataPath = process.env.APPDATA ? path.join(process.env.APPDATA, "sops", "age", "keys.txt") : null;
  const homeConfigPath = path.join(os.homedir(), ".config", "sops", "age", "keys.txt");
  if (appDataPath && fs.existsSync(appDataPath)) {
    return { found: true, location: appDataPath };
  }
  if (fs.existsSync(homeConfigPath)) {
    return { found: true, location: homeConfigPath };
  }
  return { found: false, location: null };
}

const command = process.argv[2] || "check";

switch (command) {
  case "check": {
    const targetFile = process.argv[3] || ".env.production.enc";
    // Every [FAIL] sets this, so automation cannot read a failed check as a pass.
    let failed = false;
    console.log("=== SOPS & age Status Check ===");
    // 1. Check SOPS binary
    try {
      const versionOutput = execSync(`"${SOPS_BIN}" --version`, { encoding: "utf-8" }).trim();
      console.log(`[OK] SOPS installed: ${versionOutput.split("\n")[0]}`);
    } catch (e) {
      console.error(`[FAIL] SOPS binary not found. Install via: winget install SecretsOPerationS.SOPS`);
      process.exit(1);
    }

    // 2. Check age key
    const keyInfo = checkAgeKey();
    if (keyInfo.found) {
      console.log(`[OK] Age key discovered at: ${keyInfo.location}`);
    } else {
      console.warn(`[WARN] No age private key found in standard locations or SOPS_AGE_KEY.`);
      console.warn(`       Generate a key with: age-keygen -o ~/.config/sops/age/keys.txt`);
    }

    // 3. Check .sops.yaml config
    if (fs.existsSync(".sops.yaml")) {
      console.log(`[OK] .sops.yaml config file found`);
    } else {
      console.error(`[FAIL] .sops.yaml configuration file missing in root.`);
      failed = true;
    }

    // 4. Test decrypting target file if it exists. Missing is a failure only
    // when a file was named: the default may not exist yet on a first setup.
    const exists = fs.existsSync(targetFile);
    const crlf = exists && lineEndingProblem(targetFile);
    if (!exists && process.argv[3]) {
      console.error(`[FAIL] ${targetFile} does not exist.`);
      failed = true;
    } else if (!exists) {
      console.log(`[INFO] Target file ${targetFile} does not exist yet.`);
    } else if (crlf) {
      console.error(`[FAIL] ${crlf}`);
      failed = true;
    } else {
      try {
        const result = spawnSync(SOPS_BIN, ["--decrypt", "--input-type", "dotenv", "--output-type", "dotenv", targetFile], {
          encoding: "utf-8",
        });
        if (result.status === 0) {
          const parsed = parseDotenv(result.stdout);
          const keyCount = Object.keys(parsed).length;
          console.log(`[OK] Successfully decrypted and validated ${targetFile} (${keyCount} keys configured)`);
        } else {
          console.error(`[FAIL] Decrypting ${targetFile} failed:\n${result.stderr}`);
          failed = true;
        }
      } catch (e) {
        console.error(`[FAIL] Error decrypting ${targetFile}:`, e.message);
        failed = true;
      }
    }
    // exitCode, not exit(): lets Node flush piped stdout/stderr first.
    process.exitCode = failed ? 1 : 0;
    break;
  }

  case "edit": {
    const fileToEdit = process.argv[3] || ".env.production.enc";
    if (!fs.existsSync(fileToEdit)) {
      console.error(`File ${fileToEdit} does not exist. Create or encrypt it first.`);
      process.exit(1);
    }
    // Dotenv only: sops reads YAML and JSON with CRLF fine.
    if (!/\.(ya?ml|json)$/i.test(fileToEdit)) refuseCrlf(fileToEdit);
    console.log(`Opening ${fileToEdit} with SOPS editor...`);
    const proc = spawnSync(SOPS_BIN, [fileToEdit], { stdio: "inherit" });
    if (proc.error) console.error(proc.error.message);
    if (proc.signal) console.error(`Stopped by ${proc.signal}.`);
    process.exit(proc.status ?? 1);
    break;
  }

  case "decrypt-to-local": {
    const sourceEncFile = process.argv[3] || ".env.production.enc";
    const destFile = process.argv[4] || ".env.local";
    if (!fs.existsSync(sourceEncFile)) {
      console.error(`Encrypted source file ${sourceEncFile} not found.`);
      process.exit(1);
    }
    refuseCrlf(sourceEncFile);
    console.log(`Decrypting ${sourceEncFile} -> ${destFile}...`);
    const result = spawnSync(SOPS_BIN, ["--decrypt", "--input-type", "dotenv", "--output-type", "dotenv", sourceEncFile], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      console.error(`Decryption failed:`, result.stderr);
      process.exit(1);
    }
    fs.writeFileSync(destFile, result.stdout, "utf-8");
    console.log(`Successfully wrote decrypted configuration to ${destFile}`);
    break;
  }

  case "run": {
    // Usage: node scripts/secrets.mjs run .env.production.enc -- npm start
    let encFile = ".env.production.enc";
    let cmdArgs = [];
    const dashDashIndex = process.argv.indexOf("--");
    if (dashDashIndex !== -1) {
      if (dashDashIndex > 3) {
        encFile = process.argv[3];
      }
      cmdArgs = process.argv.slice(dashDashIndex + 1);
    } else {
      cmdArgs = process.argv.slice(3);
    }

    if (cmdArgs.length === 0) {
      console.error("Usage: node scripts/secrets.mjs run [encFile] -- <command> [args...]");
      process.exit(1);
    }

    if (!fs.existsSync(encFile)) {
      console.error(`Encrypted file ${encFile} not found.`);
      process.exit(1);
    }
    refuseCrlf(encFile);

    const result = spawnSync(SOPS_BIN, ["--decrypt", "--input-type", "dotenv", "--output-type", "dotenv", encFile], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      console.error(`Failed to decrypt ${encFile} for execution:`, result.stderr);
      process.exit(1);
    }

    const injectedEnv = {
      ...process.env,
      ...parseDotenv(result.stdout),
    };

    let [cmd, ...args] = cmdArgs;
    const isWindows = process.platform === "win32";
    if (isWindows && (cmd === "npm" || cmd === "npx" || cmd === "yarn" || cmd === "pnpm")) {
      cmd = `${cmd}.cmd`;
    }

    // Node refuses to spawn a .cmd without a shell (EINVAL, CVE-2024-27980),
    // as scripts/prisma-generate-if-stale.mjs also handles.
    const proc = spawnSync(cmd, args, {
      stdio: "inherit",
      env: injectedEnv,
      shell: isWindows,
    });
    if (proc.error) console.error(proc.error.message);
    if (proc.signal) console.error(`Stopped by ${proc.signal}.`);
    process.exit(proc.status ?? 1);
    break;
  }

  default:
    console.log(`Unknown command: ${command}`);
    console.log("Available commands: check, edit, decrypt-to-local, run");
    process.exit(1);
}