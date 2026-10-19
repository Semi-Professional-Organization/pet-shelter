import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  LHDN_TAX_DEDUCTIBLE_REF,
  PUBLIC_ROS_REGISTRATION_NO,
  SHELTER_LEGAL_NAME,
  SHELTER_WHATSAPP_DISPLAY,
  SHELTER_WHATSAPP_NUMBER,
  SHELTER_WHATSAPP_URL,
  STATUTORY_ROS_REGISTRATION_NO,
  currentIssuerIdentity,
} from "@/lib/domain/shelterIdentity";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");
const OWNER = "src/lib/domain/shelterIdentity.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Every `repoPath:line` under src/, outside shelterIdentity.ts, whose text matches `pattern`. */
function offendersOutsideOwner(pattern: RegExp): string[] {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const repoPath = relative(ROOT, file).split(sep).join("/");
    if (repoPath === OWNER) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) offenders.push(`${repoPath}:${index + 1}`);
      });
  }
  return offenders;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
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

  /** ROS registration numbers and the LHDN Sec 44(6) approval reference, in any spelling. */
  const STATUTORY_LITERAL = /PPM-\d{3}-\d{2}-\d{8}|LHDN\.\d{2}\/\d{2}\/\d{2}/;

  // Walks the whole src/ tree synchronously, which costs ~6s under full-suite parallel load and
  // once failed as a timeout rather than an assertion. The tier's `testTimeout` in
  // vitest.config.mts covers it; do not re-add a per-test timeout here.
  it("appears in no file under src/ other than shelterIdentity.ts", () => {
    expect(offendersOutsideOwner(STATUTORY_LITERAL)).toEqual([]);
  });
});

describe("the shelter WhatsApp number", () => {
  it("is in the international form wa.me requires", () => {
    // Country code, no leading 0, no "+", no spaces. "wa.me/0105503056" opens no chat.
    expect(SHELTER_WHATSAPP_NUMBER).toMatch(/^60\d{8,10}$/);
    expect(SHELTER_WHATSAPP_URL).toBe(`https://wa.me/${SHELTER_WHATSAPP_NUMBER}`);
  });

  it("shows the same digits it links to", () => {
    // The footer prints the display form beside a link built from the number; the two must agree.
    expect(SHELTER_WHATSAPP_DISPLAY.replace(/\D/g, "")).toBe(SHELTER_WHATSAPP_NUMBER);
  });

  it("is no longer the placeholder that shipped", () => {
    expect(SHELTER_WHATSAPP_NUMBER).not.toBe("60123456789");
  });

  // Before 2026-10-20 nine links across six files each spelled out a made-up number, which stayed
  // live because there was nowhere single to change it. Same walk as the statutory test. Only a
  // literal digit after `wa.me/` is refused: the admin dialog's link to an *applicant's* phone,
  // built from data, is correct and must stay.
  it("is linked only through SHELTER_WHATSAPP_URL, never as a hard-coded wa.me number", () => {
    expect(offendersOutsideOwner(/wa\.me\/\d/)).toEqual([]);
  });
});
