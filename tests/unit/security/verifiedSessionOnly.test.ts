import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Authorization reads the verified session, never the raw cookie.
 *
 * `getCurrentSession()` checks a cookie's signature and expiry and returns whatever role it
 * claims; `unsealSession()` does the same one level down. `getVerifiedSession()` (the DAL)
 * re-reads the member's status and role, which is the only thing that makes a suspension, a
 * deletion or a demotion take effect before the cookie's 24 hours are up. Every raw read outside
 * the security layer is a place where a suspended member can still act — the transparency and
 * FAQ actions were eleven such places until 2026-09-18.
 *
 * `tests/unit/serverActionAuth.test.ts` cannot see this: it checks that an action calls an
 * authorization helper, not where that helper's session came from.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");

/**
 * The raw readers, matched as names rather than calls, so an aliased import
 * (`getCurrentSession as readSession`) is still caught by the line that imports it.
 */
const RAW_READER = /\b(getCurrentSession|unsealSession)\b/;

/**
 * Files allowed a raw read, each pinned to its exact number of references to **each** reader —
 * import lines included, so an aliased import (`getCurrentSession as readSession`) or a second
 * reader added to an allowed file changes a count and fails here. The allowance cannot quietly
 * widen. A comment naming a reader counts too; update the number with the reason.
 */
const ALLOWED: Record<string, { references: Record<"getCurrentSession" | "unsealSession", number>; reason: string }> = {
  "src/actions/auth.ts": {
    // One import and one call. getCurrentUserAction read the cookie too until 2026-10-19,
    // and the admin layout drew its tabs from that answer.
    references: { getCurrentSession: 2, unsealSession: 0 },
    reason: "logoutAction names the actor in its audit row before clearing the cookie, and grants nothing.",
  },
  "src/proxy.ts": {
    // One import and one call.
    references: { getCurrentSession: 0, unsealSession: 2 },
    reason:
      "an early redirect for /admin/members; the page re-checks with getVerifiedSession and " +
      "every member action with requirePermission.",
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const readers = sourceFiles(SRC)
  .map((path) => ({ file: relative(ROOT, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }))
  .filter(({ file }) => !file.startsWith("src/lib/security/"))
  .filter(({ text }) => RAW_READER.test(text));

describe("session source for authorization", () => {
  it("reads the raw session only inside the security layer and the allowed files", () => {
    // The allowed files must still be found, or the scan has stopped matching and passes vacuously.
    expect(readers.map(({ file }) => file)).toEqual(expect.arrayContaining(Object.keys(ALLOWED)));
    expect(readers.map(({ file }) => file).filter((file) => !(file in ALLOWED))).toEqual([]);
  });

  it.each(Object.entries(ALLOWED))("%s references each raw reader exactly as often as allowed", (file, allowance) => {
    const text = readers.find((reader) => reader.file === file)?.text ?? "";
    const counted = Object.fromEntries(
      Object.keys(allowance.references).map((name) => [name, text.match(new RegExp(`\\b${name}\\b`, "g"))?.length ?? 0])
    );

    expect(counted).toEqual(allowance.references);
  });
});
