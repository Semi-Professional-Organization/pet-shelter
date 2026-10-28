import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * Every exported function in a `"use server"` module is an HTTP POST endpoint
 * whose action id ships in the client bundle. Anyone can call it.
 *
 * This is not theoretical here: `loadShelterSettings` and `getShelterSettings`
 * were both added as innocuous "read helpers" and both returned the entire
 * shelter settings object — `resendApiKey` included — to any caller. The
 * authorization reflex fires on mutations, so a read slipped past it twice.
 *
 * This guard makes that a deliberate choice rather than an oversight: a new
 * action either performs an authorization check or is listed below with a
 * reason. It cannot be silently neither.
 */

const ACTIONS_DIR = join(process.cwd(), "src", "actions");

/** Helpers that establish the caller is allowed to proceed. */
const AUTH_TOKENS = [
  "assertAuthorized",
  "verifyAdminSession",
  "getAdminActorOrThrow",
  // The permission layer that replaced direct role checks.
  "assertHasPermission",
  "requirePermission",
  // Named per-feature gates that call one of the above internally.
  "requireFaqEditor",
  // Bearer-credential checks, for flows whose caller cannot have a session:
  // an emailed unsubscribe link carries a signed token instead.
  "verifyNotificationToken",
  // The sponsor portal authenticates against its own session, not staff RBAC.
  "getCurrentSponsorSession",
];

/**
 * Actions that are reachable without a session, each for a stated reason.
 *
 * Adding a name here is a security decision. It means "a stranger may call
 * this", so the response must contain nothing a stranger should not see.
 */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  // Authentication itself cannot require a session.
  loginAction: "establishes the session",
  registerAction: "account creation",
  logoutAction: "clears the session; safe for anyone",
  getCurrentUserAction: "returns the caller's own session or null",
  acceptInvitation:
    "an invitee has no session yet; the single-use invitation token is the credential",

  // Public-facing submissions from visitors who are not staff.
  submitApplication: "adoption applications come from the public",
  lookupApplicationStatusAction:
    "applicants check their own status; rate-limited and keyed on their reference",
  submitDonationPledgeAction: "donations come from the public",

  // The public catalog. All three filter to non-archived pets.
  getPublicPets: "public adoption catalog",
  getPets: "alias of getPublicPets",
  // Listed explicitly as of this change. It was passing the guard by accident:
  // `collectServerActions` slices a body from one exported function to the next,
  // and the private `getAdminActorOrThrow` helper that follows this one was being
  // swallowed into its body, carrying an AUTH_TOKEN with it. The classification
  // is now stated rather than inferred from where a helper happens to sit.
  getPetById: "single public profile; returns null for an archived animal",

  // Public content, served on pages any visitor can open. Pre-existing on
  // master and not touched by this change: listed so the guard passes on
  // today's tree, with their payloads not audited field by field here.
  getFaqsAction: "published rows only, the same rows /faq renders anonymously",
  fetchFaqsAction: "alias of getFaqsAction",
  getFaqByIdAction: "published rows only, rendered anonymously",
  getRehabNeedsAction: "public rehabilitation needs list",
  fetchRehabNeedsAction: "alias of getRehabNeedsAction",
  getRehabNeedByIdAction: "public rehabilitation need",

  // The sponsor portal's own front door. A visitor signing up or signing in
  // cannot already hold the session these would check for.
  registerSponsorAction: "creates the sponsor account",
  sponsorLoginAction: "establishes the sponsor session",
  getSponsorDashboardAction:
    "delegates to getSponsorDashboard, which resolves the caller's own sponsor context and returns null without one",

  // Sponsorship is a public donation flow, like submitDonationPledgeAction.
  createPetSponsorshipAction: "donors sponsor without an account",
  getPetSponsorshipSummaryAction: "public progress totals shown on pet pages",

  // Delegates to an authorized action rather than checking inline.
  deletePet: "calls toggleArchivePet, which authorizes",

};

interface ActionExport {
  file: string;
  name: string;
  body: string;
}

function extractActionsFromSource(file: string, source: string): ActionExport[] {
  if (!/^\s*["']use server["']/m.test(source)) return [];

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false
  );

  const found: ActionExport[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node)) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
      if (isExported && isAsync && node.name && node.body) {
        found.push({
          file,
          name: node.name.text,
          body: node.body.getText(sourceFile),
        });
      }
    } else if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            let init = decl.initializer;
            while (ts.isParenthesizedExpression(init)) {
              init = init.expression;
            }
            if (
              (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
              init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
            ) {
              found.push({
                file,
                name: decl.name.text,
                body: init.body.getText(sourceFile),
              });
            }
          }
        }
      }
    }
  });

  return found;
}

function collectServerActions(dir: string = ACTIONS_DIR): ActionExport[] {
  const found: ActionExport[] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(dir, file), "utf8");
    found.push(...extractActionsFromSource(file, source));
  }

  return found;
}

describe("server action authorization", () => {
  const actions = collectServerActions();

  it("finds the server action modules", () => {
    // Guards the extractor itself: a regex that silently matches nothing would
    // make every assertion below vacuously pass.
    expect(actions.length).toBeGreaterThan(10);
    expect(new Set(actions.map((a) => a.file)).size).toBeGreaterThan(3);
  });

  it("every exported action either authorizes or is a documented exception", () => {
    const unguarded = actions
      .filter((a) => !AUTH_TOKENS.some((token) => a.body.includes(token)))
      .filter((a) => !(a.name in INTENTIONALLY_PUBLIC))
      .map((a) => `${a.file}:${a.name}`);

    expect(unguarded).toEqual([]);
  });

  it("keeps the exception list free of names that no longer exist", () => {
    const names = new Set(actions.map((a) => a.name));
    const stale = Object.keys(INTENTIONALLY_PUBLIC).filter((n) => !names.has(n));
    expect(stale).toEqual([]);
  });

  it("does not expose an ungated settings reader", () => {
    // The specific regression: two of these shipped, both returning resendApiKey.
    const settings = actions.filter((a) => a.file === "settings.ts");
    expect(settings.length).toBeGreaterThan(0);
    for (const action of settings) {
      expect(AUTH_TOKENS.some((token) => action.body.includes(token))).toBe(true);
    }
  });

  it("does not attribute private helper auth tokens to preceding exported actions", () => {
    // Demonstrates the fix for tasks/open/server-action-auth-guard-slices-bodies-by-the-next-export.md:
    // an unguarded exported action followed by a private helper containing an AUTH_TOKEN
    // must not have that token attributed to its body.
    const mockSource = `
"use server";

export async function vulnerablePublicAction() {
  return "unprotected data";
}

async function getAdminActorOrThrow() {
  const session = await verifyAdminSession("MANAGE_PETS");
  return session;
}
`;
    const extracted = extractActionsFromSource("mockActions.ts", mockSource);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].name).toBe("vulnerablePublicAction");
    expect(AUTH_TOKENS.some((token) => extracted[0].body.includes(token))).toBe(false);

    // If judged against the guard, this action must be flagged as unguarded
    const unguarded = extracted
      .filter((a) => !AUTH_TOKENS.some((token) => a.body.includes(token)))
      .filter((a) => !(a.name in INTENTIONALLY_PUBLIC));
    expect(unguarded).toHaveLength(1);
    expect(unguarded[0].name).toBe("vulnerablePublicAction");
  });

  it("extracts and audits exported async arrow functions and function expressions", () => {
    const mockSource = `
"use server";

export const unguardedArrowAction = async () => {
  return "unprotected data";
};

export const guardedArrowAction = async () => {
  await verifyAdminSession("MANAGE_PETS");
  return "protected data";
};

export const guardedExpressionAction = async function () {
  await verifyAdminSession("MANAGE_PETS");
  return "protected data";
};
`;
    const extracted = extractActionsFromSource("mockArrowActions.ts", mockSource);
    expect(extracted).toHaveLength(3);
    expect(extracted.map((a) => a.name)).toEqual([
      "unguardedArrowAction",
      "guardedArrowAction",
      "guardedExpressionAction",
    ]);

    const unguarded = extracted
      .filter((a) => !AUTH_TOKENS.some((token) => a.body.includes(token)))
      .filter((a) => !(a.name in INTENTIONALLY_PUBLIC));
    expect(unguarded).toHaveLength(1);
    expect(unguarded[0].name).toBe("unguardedArrowAction");
  });
});
