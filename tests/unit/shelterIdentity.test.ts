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

const PUBLIC_REPORTS = join(ROOT, "public", "reports");

function walk(dir: string, accept: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept.test(full)) out.push(full);
  }
  return out;
}

interface SourceLine {
  at: string;
  repoPath: string;
  text: string;
}

let cachedLines: SourceLine[] | undefined;

/**
 * Every line of every `.ts`, `.tsx` and `.json` file under src/, plus the placeholder report
 * PDFs under public/reports (uncompressed, so their text is greppable), read once per run.
 *
 * Walking src/ synchronously costs ~6s under full-suite parallel load and once failed as a
 * timeout rather than an assertion, so the walk is shared by every guard below rather than
 * repeated per pattern. The tier's `testTimeout` in vitest.config.mts covers it; do not re-add a
 * per-test timeout here.
 */
function sourceLines(): SourceLine[] {
  if (cachedLines) return cachedLines;
  const files = [...walk(SRC, /\.(tsx?|json)$/), ...walk(PUBLIC_REPORTS, /\.pdf$/)];
  cachedLines = files.flatMap((file) => {
    const repoPath = relative(ROOT, file).split(sep).join("/");
    return readFileSync(file, file.endsWith(".pdf") ? "latin1" : "utf8")
      .split("\n")
      .map((text, index) => ({ at: `${repoPath}:${index + 1}`, repoPath, text }));
  });
  return cachedLines;
}

/** Every `repoPath:line` in a `.ts`/`.tsx` file under src/, outside shelterIdentity.ts, matching `pattern`. */
function offendersOutsideOwner(pattern: RegExp): string[] {
  return sourceLines()
    .filter((l) => /\.tsx?$/.test(l.repoPath) && l.repoPath !== OWNER && pattern.test(l.text))
    .map((l) => l.at);
}

/** Every `repoPath:line` in src/ (code and data) or the report PDFs matching `pattern`. */
function offendersAnywhere(pattern: RegExp): string[] {
  return sourceLines()
    .filter((l) => pattern.test(l.text))
    .map((l) => l.at);
}

describe("registration claims the shelter cannot back", () => {
  // The shelter is not a registered society and holds no LHDN Subsection 44(6) approval
  // (owner, 2026-11-05; #239, #249). Until then src/ carried two ROS numbers, an LHDN approval
  // reference and a "Persatuan" legal name, and printed them on receipts, the sponsorship modal
  // and the sponsor certificate. These guards keep them from coming back by accident. If the
  // shelter does register, the decision note named in shelterIdentity.ts says what returns.

  /** ROS registration numbers and the LHDN approval reference, in any spelling. */
  const STATUTORY_LITERAL = /PPM-\d{3}-\d{2}-\d{8}|LHDN\.\d{2}\/\d{2}\/\d{2}/;

  /**
   * Names, registries and statute references that assert a registered society or tax relief.
   * Case-insensitive, so "persatuan" and "PERTUBUHAN KEBAJIKAN" count too. A bare "LHDN",
   * "ROS" or "tax-deductible" is not matched: the site says plainly that it is *not* a tax
   * receipt, and history comments name what was removed.
   */
  const SOCIETY_CLAIM =
    /Persatuan|Pertubuhan Kebajikan|Pendaftar Pertubuhan|Registrar of Societies|44\(6\)|registered (?:non-?profit|charity|NGO)|haiwan berdaftar/i;

  // ceiling: a phrase list, so it catches the spellings that shipped before 2026-11-05 (every
  // phrase above was live in src/ or a report PDF) and their case variants, not synonyms or
  // a new wording. The PDF half reads raw bytes, so it sees only uncompressed text written as
  // one string, which is how the placeholder reports are built; a real, compressed or kerned
  // statement added to public/reports needs a text extractor here instead. Accuracy is measured
  // by the probe in the #249/#250 PR: reverting any one of those files makes this fail.

  it("prints no ROS number or LHDN reference in src/ or the report PDFs", () => {
    expect(offendersAnywhere(STATUTORY_LITERAL)).toEqual([]);
  });

  it("names no society and claims no registration in src/ or the report PDFs", () => {
    expect(offendersAnywhere(SOCIETY_CLAIM)).toEqual([]);
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

describe("the shelter bank account", () => {
  // Until 2026-11-05 the donate widget, the sponsorship popup, the translations and FAQ faq-024
  // told donors to transfer to this Maybank number. The owner confirmed it is fake (#252).
  // Digits with any run of spaces, dots, slashes, hyphens or dashes between them, so
  // "5140-1234-5678", "514012345678", "5140–1234–5678" and "5140 1234 5678" all count.
  //
  // ceiling: catches this one number with the separators above, one source line at a time, in
  // src/ code and data and the report PDFs. The PDFs are read as latin1, so a no-break space
  // (0xA0) counts but an en dash written as a StandardEncoding byte or an octal escape does not.
  // It does not scan prisma/, scripts/ or production data, so a number added to a seed or a
  // manual SQL migration gets through. It cannot tell a real account from another made-up one;
  // that is what the null default and the "copy from a bank statement" rule on
  // SHELTER_BANK_ACCOUNT are for. Measured by the probe in the #252 PR: restoring any one of the
  // removed copies, or an en-dash spelling in src/, makes this fail.
  // Separators: whitespace (incl. no-break space), ".", "/", ASCII "-" and the Unicode
  // hyphens and dashes U+2010 to U+2015.
  const FAKE_ACCOUNT = new RegExp("514012345678".split("").join("[\\s./\\-\\u2010-\\u2015]*"));

  it("never prints the fake Maybank number anywhere in src/ or the report PDFs", () => {
    expect(offendersAnywhere(FAKE_ACCOUNT)).toEqual([]);
  });
});
