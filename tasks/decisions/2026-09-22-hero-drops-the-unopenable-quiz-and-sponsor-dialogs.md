# The hero drops the quiz and sponsorship dialogs instead of regrowing buttons for them

**Decided:** 2026-09-22

Settles `tasks/open/hero-mounts-a-quiz-and-sponsor-dialog-nothing-can-open.md`, which offered two
ways out: delete the mounts, or bring back the FE-02 buttons that used to drive them.

## This is the second entry for that decision, and it corrects the first

`tasks/decisions/2026-09-22-hero-removes-dead-dialog-mounts.md` reached the same conclusion the
same day, from a session working uncommitted in the shared checkout; it landed on `master` inside
`4782ff2` ("fix(security): Extract action bodies via AST", #88), a commit about something else
entirely. That entry stands as written — `tasks/README.md` forbids rewriting a `decisions/` file —
so this one supplements it rather than replacing it.

**The choice is the same and is not in dispute.** Two of the three reasons given for it are wrong,
and both are corrected below: the Navbar citation under "Visitors lose nothing", and the claim that
`tests/components/home.test.tsx:153` forbids the alternative. The third reason — the `localStorage`
cost — is right, but the test written to prove it was not; see "Verification".

Read the two together. If only one survives a future cleanup, it should be this one.

## The choice

`src/components/layout/Hero.tsx` no longer imports or mounts `PetMatchQuiz` and
`SponsorshipModal`, and `isQuizOpen`/`isSponsorshipOpen` are gone with them. The three CTA links
(`/pets`, `/donate`, `/get-involved`) are untouched. The `useState` import stays — `useCountUp`
uses it.

## Why, and what the open entry and the first decision got wrong

**Visitors lose nothing on `/`, but not by the route either entry names.** Both credit `Navbar`
with mounting both dialogs "on every page". It mounts both, but only the quiz has a live desktop
trigger: the desktop sponsorship button at `Navbar.tsx:261-269` is a commented-out JSX block, so
`:264` is not live code. The sponsorship dialog is reachable from the Navbar only through the
mobile sheet (`:326-327`). What actually keeps sponsorship reachable on a desktop `/` is
`PetGallery`, whose header buttons sit at `:117-141`, outside the `showFilters &&` block that opens
at `:198` — so they render even with `showFilters={false}`. The conclusion holds; the citation
behind it did not, and a later reader deleting the PetGallery buttons would have taken the last
desktop trigger with them.

**`tests/components/home.test.tsx:153` does not decide this, either way.** The open entry treats
"routes to the three destinations the sitemap requires" as what pins the shipped three-link layout
against FE-02, and the first decision entry goes further — its reason 3 says "Reintroducing modal
buttons would contradict the active component test suite", having run that suite green. Neither
holds. The test reads `getAllByRole("link")` and asserts `toContain` three times: it is not
exhaustive, and modal triggers are `<button>`, which never appear in a link query. FE-02's buttons
could have been restored without that test moving, and running the suite cannot detect that,
because it passes in both worlds. Anyone reversing this decision should know the test is not the
obstacle it looks like. Written up in
`tasks/lessons/2026-09-22-a-tocontain-assertion-cited-as-a-constraint-constrains-nothing.md`.

**The sitemap that test names exists nowhere.** `grep -ril sitemap` over `src/`, `tests/`, `e2e/`,
`public/`, `scripts/`, `docs/` and `tasks/` returns exactly one hit: the test's own name. There is
no `src/app/sitemap.ts` either. So the requirement the test claims to enforce is not written down
anywhere, and `docs/archives/tasks/SPRINT_PLAN_BACKEND_AND_FRONTEND.md:189` (FE-02) is the only
document that states a hero button set — naming *Meet Our Animals*, *Pet Match Quiz* and *Sponsor
Care*, which is not what shipped. The spec on disk and the shipped page disagree and neither cites
the other. Deleting the mounts does not resolve that disagreement; it only stops the page paying
for it.

**What the dead pair cost.** Both dialogs' stores are module-level, so mounting them ran
`usePetStore` and `useSponsorshipStore` on every homepage load. Deleting the mounts stops that.

## What is deliberately left behind

`hero.quizBtn` and `hero.sponsorBtn` stay in `src/lib/i18n/translations.ts` (en and ms), now
unused. They are the human-authored labels FE-02 would need, and deleting them would throw away a
Malay translation that a restore would have to re-commission. The whole `hero.*` namespace is
already unused — `Hero.tsx` branches on `isMs` inline rather than calling `t()` — so these two keys
join a pile rather than starting one.

## Verification

`tests/components/heroDialogMounts.test.tsx` mounts `Hero` with both dialog modules replaced by
recording stubs and asserts neither is invoked. It was run against the unfixed component first and
failed there (`Number of calls: 1`), then passed against the fix. A first attempt that spied on
`localStorage` instead **passed against the unfixed component** and was discarded: the stores read
their keys at module import, before any spy can be installed.
