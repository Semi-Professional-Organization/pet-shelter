import { describe, it, expect } from "vitest";
import { evaluate, features, suggest } from "../../scripts/lib/issueGroups/suggest.mjs";
import { suggestionCorpus } from "../../scripts/lib/issueGroups/plan.mjs";

/**
 * Tests for the suggester behind `scripts/issue-groups.mjs --suggest`. Its accuracy on the real
 * grouping is measured by `--suggest --evaluate` and recorded in
 * `tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`; these pin the mechanics.
 */

const issue = (number: number, extra: { title?: string; body?: string } = {}) => ({ number, title: `Issue ${number}`, body: "", ...extra });
const group = (key: string, issues: number[]) => ({ key, title: key, summary: "", issues });

describe("suggestions", () => {
  const corpus = [
    issue(1, { title: "Pet form wipes the medical timeline", body: "`PetFormDialog` in src/components/admin/PetFormDialog.tsx resets the timeline." }),
    issue(2, { title: "Pet form defaults the intake date", body: "src/components/admin/PetFormDialog.tsx uses the UTC day for intake." }),
    issue(3, { title: "Drift log misses merges", body: "The hook in .claude/hooks/agent-guard.mjs records the drift log." }),
    issue(4, { title: "Drift log empty for some sessions", body: "agent-guard writes no drift log line for linked worktrees." }),
    issue(5, { title: "Birth date field in the pet form", body: "`PetFormDialog` shows the birth date estimate nowhere." }),
  ];
  const config = { groups: [group("pet-form", [1, 2]), group("agent-tooling", [3, 4])] };

  it("proposes the group whose issues name the same file, with that file as evidence", () => {
    const [proposal] = suggest(config, corpus, [corpus[4]]);
    expect(proposal).toMatchObject({ number: 5, clear: true, best: { key: "pet-form" } });
    expect(proposal.best.evidence).toContain("petformdialog");
  });

  it("reads repo-root paths only, and meets a test file at its bare name", () => {
    const found = [...features(issue(9, { body: "`@prisma/client` and node_modules/next/dist/docs/x; see tests/unit/issueGroups.test.ts" })).keys()];
    expect(found.filter((f) => f.startsWith("path:"))).toEqual(["path:tests/unit/issuegroups.test.ts"]);
    expect(found).toContain("id:issuegroups");
  });

  it("keeps a dynamic segment's bracket and drops a leading ./", () => {
    const paths = (body: string) => [...features(issue(9, { body })).keys()].filter((f) => f.startsWith("path:"));
    expect(paths("(src/app/[id])")).toEqual(["path:src/app/[id]"]);
    expect(paths("see ./src/lib/b.ts")).toEqual(["path:src/lib/b.ts"]);
  });

  it("meets a kebab-case file, a file name and a call at their bare names", () => {
    const ids = (body: string) => [...features(issue(9, { body })).keys()].filter((f) => f.startsWith("id:"));
    expect(ids("see .claude/hooks/agent-guard.mjs")).toEqual(["id:agent-guard"]);
    expect(ids("the `agent-guard` hook")).toEqual(["id:agent-guard"]);
    expect(ids("`PetFormDialog.tsx` and `verifyAdminSession(req)`")).toEqual(["id:petformdialog", "id:verifyadminsession"]);
  });

  it("keeps a backticked property whole, and gives Next.js route files no shared name", () => {
    const ids = (body: string) => [...features(issue(9, { body })).keys()].filter((f) => f.startsWith("id:"));
    expect(ids("`Pet.age` and `prisma.pet.findUnique()`")).toEqual(["id:pet.age", "id:prisma.pet.findunique"]);
    expect(ids("src/app/pets/page.tsx and src/app/donate/page.tsx")).toEqual([]);
  });

  it("reads a path inside a markdown link as the same path written bare", () => {
    const found = [...features(issue(9, { body: "see [src/lib/a.ts](src/lib/a.ts)" })).keys()];
    expect(found.filter((f) => f.startsWith("path:"))).toEqual(["path:src/lib/a.ts"]);
  });

  it("measures itself by hiding each grouped issue in turn", () => {
    const { results, right, wrong, unclear } = evaluate(config, corpus);
    expect(results).toHaveLength(4);
    expect([right, wrong, unclear]).toEqual([1, 0, 0]);
  });

  it("counts an issue that shares nothing as no clear group, not as a hit for the first group by name", () => {
    const lonely = issue(6, { title: "zebra quokka" });
    const { results, right, unclear } = evaluate({ groups: [group("aaa", [6, 1, 2]), group("agent-tooling", [3, 4])] }, [...corpus, lonely]);
    // Every group scores zero, so the real group ties for last rather than winning by name.
    expect(results.find((r: { number: number }) => r.number === 6)).toMatchObject({ rank: 2, clear: false });
    expect(right).toBeLessThan(1);
    expect(unclear).toBeGreaterThan(0);
  });

  it("learns from every issue here except group parents, recorded or labelled", () => {
    const snapshot = {
      repo: "o/r",
      issues: [
        { ...corpus[0], repo: "o/r", labels: [] },
        { ...issue(10), repo: "o/r", labels: ["Group"], body: "<!-- issue-group: pet-form -->" },
        { ...issue(11), repo: "o/r", labels: [] },
        { ...issue(12), repo: "o/x", labels: [] },
      ],
    };
    const recordedConfig = { groups: [{ ...group("pet-form", [1]), parent: 11 }] };
    const numbers = suggestionCorpus(recordedConfig, snapshot, { record: new Map() }).map((i: { number: number }) => i.number);
    expect(numbers).toEqual([1]);
  });
});
