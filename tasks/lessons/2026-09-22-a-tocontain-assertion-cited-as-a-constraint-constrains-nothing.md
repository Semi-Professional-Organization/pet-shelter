# A `toContain` assertion cited as a constraint constrains nothing

**Learned:** 2026-09-22

Two independent documents said that `tests/components/home.test.tsx:153` — "routes to the three
destinations the sitemap requires" — pinned the hero's shipped three-link layout against the sprint
plan's FE-02 buttons, and that restoring those buttons would contradict the active suite. The brief
for the work said it. A parallel session's `tasks/decisions/` entry said it, as reason #3 for its
choice, and had run the suite green.

The test is:

    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/pets");
    expect(hrefs).toContain("/donate");
    expect(hrefs).toContain("/get-involved");

`toContain` is not exhaustive — it says those three are present, never that nothing else is. And
FE-02's *Pet Match Quiz* and *Sponsor Care* are `<button>` elements, which `getAllByRole("link")`
does not return at all. Both FE-02 buttons could have been added without that test moving. The
decision it was cited to justify was still the right one, but it rested on an obstacle that was not
there, and the next person to reverse it would have wasted a day proving that.

Running the suite green does not detect this. The test passes in both worlds; that is the defect.

The same file names a sitemap. `grep -ril sitemap` over `src/`, `tests/`, `e2e/`, `public/`,
`scripts/`, `docs/` and `tasks/` returns exactly one hit: the test's own name. There is no
`src/app/sitemap.ts`. A requirement asserted in a test title, sourced from a document that does not
exist, had been treated as the authority over a spec that does.

**Rule:** before citing a test as the reason a change is not allowed, read its assertions and ask
what else would pass them. An inclusion check (`toContain`, `toMatchObject`, `getBy*` on one node)
bounds one side only, and a query scoped to a role bounds nothing about other roles. If the claim
is "this layout is pinned", the test must fail on the alternative — check that by writing the
alternative, not by running the suite.
