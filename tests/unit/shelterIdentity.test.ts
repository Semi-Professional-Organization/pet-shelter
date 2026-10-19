import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  LHDN_TAX_DEDUCTIBLE_REF,
  PUBLIC_ROS_REGISTRATION_NO,
  SHELTER_LEGAL_NAME,
  STATUTORY_ROS_REGISTRATION_NO,
  currentIssuerIdentity,
} from "@/lib/domain/shelterIdentity";

// The module reads ROS_REGISTRATION_NO once, when the import above loads it. Vitest hoists this
// above the imports, so that load sees the variable unset and the default the tests below pin.
// Unset rather than "": the module reads it with `??`, under which "" is a configured value.
vi.hoisted(() => {
  vi.stubEnv("ROS_REGISTRATION_NO", undefined);
});

describe("statutory identifiers", () => {
  it("exposes the LHDN Subsection 44(6) approval reference", () => {
    expect(LHDN_TAX_DEDUCTIBLE_REF).toBe("LHDN.01/35/42/51/179-6.4912");
  });

  it("keeps the registered society name as filed with the ROS", () => {
    expect(SHELTER_LEGAL_NAME).toBe("Persatuan Harapan Haiwan Terbiar Selangor");
  });

  it("preserves the registration number that issued receipts already carry", () => {
    // Centralising these constants must not silently change what lands on a tax
    // document. This pins the value that `src/actions/donations.ts` emitted before
    // the constants were collapsed into one module.
    expect(STATUTORY_ROS_REGISTRATION_NO).toBe("PPM-021-10-18082021");
  });
});

describe("the unresolved ROS registration discrepancy (P2)", () => {
  it("still has two deliberately divergent values", () => {
    // ── READ THIS BEFORE "FIXING" THE FAILURE ────────────────────────────────
    // Two digit-transposed ROS numbers are in use: one on public pages, one on
    // statutory receipts and ROS exports. Which is correct is BLOCKED on someone
    // checking the physical ROS certificate — see
    // docs/archives/tasks/HANDOFF_SECURITY_REHAB_AND_HISTORY.md (P2).
    //
    // This assertion exists so the divergence cannot be "tidied up" by aligning
    // one constant to the other without that check. When the certificate is
    // confirmed: unify the constants in src/lib/domain/shelterIdentity.ts and
    // DELETE this test, in the same change.
    expect(STATUTORY_ROS_REGISTRATION_NO).not.toBe(PUBLIC_ROS_REGISTRATION_NO);
    expect(PUBLIC_ROS_REGISTRATION_NO).toBe("PPM-012-10-18042016");
  });

  it("can be corrected by configuration, without a code deploy", async () => {
    // The one test that needs a fresh module: the override is read at load, so only a re-import
    // can see it.
    vi.resetModules();
    vi.stubEnv("ROS_REGISTRATION_NO", "PPM-012-10-18042016");

    const reloaded = await import("@/lib/domain/shelterIdentity");

    expect(reloaded.STATUTORY_ROS_REGISTRATION_NO).toBe("PPM-012-10-18042016");
    expect(reloaded.currentIssuerIdentity().shelterRegistrationNo).toBe(
      "PPM-012-10-18042016"
    );
  });
});

describe("currentIssuerIdentity", () => {
  it("captures the identifiers a receipt is stamped with at issue time", () => {
    expect(currentIssuerIdentity()).toEqual({
      taxDeductibleRef: LHDN_TAX_DEDUCTIBLE_REF,
      shelterRegistrationNo: STATUTORY_ROS_REGISTRATION_NO,
    });
  });

  it("returns a fresh object each call, so a stored snapshot cannot be mutated later", () => {
    const first = currentIssuerIdentity();
    const second = currentIssuerIdentity();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe("statutory literals are confined to this module", () => {
  // The durable half of the fix, and the reason this suite is not enough on its own:
  // proving `STATUTORY_ROS_REGISTRATION_NO` is overridable says nothing about whether the
  // call sites read it. A single inlined string means correcting P2 half-applies — one
  // deployment emitting two different registration numbers, invisible until somebody
  // reconciles a receipt against an export.
  //
  // Same shape as tests/unit/layerBoundaries.test.ts: a property of the source tree that
  // no behavioural test can see.
  const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
  const SRC = join(ROOT, "src");
  const OWNER = "src/lib/domain/shelterIdentity.ts";

  /** ROS registration numbers and the LHDN Sec 44(6) approval reference, in any spelling. */
  const STATUTORY_LITERAL = /PPM-\d{3}-\d{2}-\d{8}|LHDN\.\d{2}\/\d{2}\/\d{2}/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(full)) out.push(full);
    }
    return out;
  }

  // Walks the whole src/ tree synchronously, which costs ~6s under full-suite parallel load and
  // once failed as a timeout rather than an assertion. The tier's `testTimeout` in
  // vitest.config.mts covers it; do not re-add a per-test timeout here.
  it("appears in no file under src/ other than shelterIdentity.ts", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const repoPath = relative(ROOT, file).split(sep).join("/");
      if (repoPath === OWNER) continue;

      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (STATUTORY_LITERAL.test(line)) offenders.push(`${repoPath}:${index + 1}`);
        });
    }

    expect(offenders).toEqual([]);
  });
});
