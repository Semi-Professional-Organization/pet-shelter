import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  SHELTER_PHONE_DISPLAY,
  SHELTER_PHONE_TEL,
  SHELTER_WHATSAPP_DISPLAY,
  SHELTER_WHATSAPP_NUMBER,
  SHELTER_WHATSAPP_URL,
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

/**
 * Every `repoPath:line` under src/ whose text matches `pattern`, skipping shelterIdentity.ts
 * unless `includeOwner` is set.
 */
function offendersOutsideOwner(
  pattern: RegExp,
  { includeOwner = false }: { includeOwner?: boolean } = {}
): string[] {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const repoPath = relative(ROOT, file).split(sep).join("/");
    if (repoPath === OWNER && !includeOwner) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) offenders.push(`${repoPath}:${index + 1}`);
      });
  }
  return offenders;
}

describe("registration claims the shelter cannot back", () => {
  // The shelter is not a registered society and holds no LHDN Subsection 44(6) approval
  // (owner, 2026-11-05; #239, #249). Until then src/ carried two ROS numbers, an LHDN approval
  // reference and a "Persatuan" legal name, and printed them on receipts, the sponsorship modal
  // and the sponsor certificate. These guards keep them from coming back by accident. If the
  // shelter does register, the decision note named in shelterIdentity.ts says what returns.

  /** ROS registration numbers and the LHDN approval reference, in any spelling. */
  const STATUTORY_LITERAL = /PPM-\d{3}-\d{2}-\d{8}|LHDN\.\d{2}\/\d{2}\/\d{2}/;

  /** Names and statute references that assert a registered society or tax relief. */
  const SOCIETY_CLAIM = /Persatuan|Pertubuhan Kebajikan|44\(6\)/;

  /** The `accountHolder:` lines of the dictionary, wherever they sit in the file (#252). */
  const ACCOUNT_HOLDER_LINES = new Set(
    readFileSync(join(SRC, "lib", "i18n", "translations.ts"), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        /^\s*accountHolder:/.test(line) ? [`src/lib/i18n/translations.ts:${index + 1}`] : []
      )
  );

  // Walks the whole src/ tree synchronously, which costs ~6s under full-suite parallel load and
  // once failed as a timeout rather than an assertion. The tier's `testTimeout` in
  // vitest.config.mts covers it; do not re-add a per-test timeout here.
  it("prints no ROS number or LHDN reference anywhere under src/", () => {
    expect(offendersOutsideOwner(STATUTORY_LITERAL, { includeOwner: true })).toEqual([]);
  });

  it("names no society and cites no tax-relief section anywhere under src/", () => {
    // `donations.accountHolder` is the bank account's own name, a banking fact the owner is
    // confirming with the shelter (#252). It is the one exception, and only until then.
    const offenders = offendersOutsideOwner(SOCIETY_CLAIM, { includeOwner: true }).filter(
      (at) => !ACCOUNT_HOLDER_LINES.has(at)
    );
    expect(offenders).toEqual([]);
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

describe("the shelter phone number", () => {
  it("is the same line as WhatsApp, in E.164 for tel: links", () => {
    expect(SHELTER_PHONE_TEL).toBe(`+${SHELTER_WHATSAPP_NUMBER}`);
    expect(SHELTER_PHONE_DISPLAY.replace(/\D/g, "")).toBe(SHELTER_WHATSAPP_NUMBER);
  });

  // Before 2026-10-20 an unconfirmed landline, 03-7876 5432, was written out sixteen times:
  // tel: links, the navbar, the footer, default settings, translations and every outgoing email.
  // A tel: link to an applicant's own phone is built from data and passes.
  it("is dialled only through SHELTER_PHONE_TEL, never as a hard-coded tel: number", () => {
    expect(offendersOutsideOwner(/tel:\+?\d/)).toEqual([]);
  });

  it("no longer carries the unconfirmed landline anywhere in src/", () => {
    expect(offendersOutsideOwner(/7876 ?5432|78765432/)).toEqual([]);
  });
});
