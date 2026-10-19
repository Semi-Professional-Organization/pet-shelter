# `feature/frontend` is rebased onto master as a port, keeping master where the branch never saw it

**Decided:** 2026-10-20

`feature/frontend` (28 commits, forked at `c95d0b8`) met a master 233 commits ahead that had
independently rebuilt the FAQ (database CMS), the donate page (`DonatePageView`, ledger-derived
figures), bulletins (server store), pets (care tracks) and adoption (multi-step wizard). Per
`tasks/lessons/2026-09-04-overtaken-by-160-commits-is-a-rebuild-not-a-merge.md`, each branch commit
was re-expressed on master's code rather than merged hunk by hunk. An earlier attempt at the same
rebase is kept at `refs/backup/frontend-rebase-attempt-1`; it had taken the branch's whole donate
page over master's, restoring hard-coded figures and the ROS/LHDN badges.

The rule applied: master's behaviour, data paths, i18n and tests win; the branch's layout, copy and
explicit decisions are applied on top. Calls someone could reasonably reverse:

- **Kept from master although the branch removed it**, because the branch predates master's
  version: the hero's staff-editable impact counters (now a band under the hero), the home pillars'
  "See how this works" links, and the home `#how-it-works` steps (also on `/adoption`).
- **Branch copy moved into the dictionary** wherever master had moved the string, so the Malay site
  keeps working; master tests that pinned old copy were updated to the new copy.
- **Branch changes dropped as superseded:** the `/faq` page and `FaqSection` (master's `FaqBrowser`
  serves `/faq`), the reference-ID success screen (master's wizard shows the reference code), the
  hand-listed gallery status options, and the literal English age-band labels.
- **`/pets` drops its FAQ and notices**, as the branch intended; notices aimed at `/pets` still
  list on `/bulletins`.
- **The blanket `/.agents`, `/.claude`, `/.github` ignore rules were dropped**: they recreate the
  PR #25 incident `tests/unit/agentDefinitions.test.ts` guards against.
- **The hero's three-link test was rewritten** to one call to action, with Donate and Get
  Involved pinned on the quick actions instead; its "sitemap" never existed
  (`tasks/decisions/2026-09-22-hero-drops-the-unopenable-quiz-and-sponsor-dialogs.md`).
- **The five adopt/foster commits were folded into one** (`feat(pets): Filter animals by adopt or
  foster`), because each rewrote the same five files; the placement filter is one more key in
  master's gallery controller.
- **Owner decisions from the same day** (`tasks/decisions/2026-10-20-merged-site-map-and-impact-page.md`):
  `/impact` is dropped for `/transparency`, and the hero ships without the unlicensed cut-outs.
