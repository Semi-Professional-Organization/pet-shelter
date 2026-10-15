# A guard that does not cover the fix that produced it is half a guard

**Learned:** 2026-09-22

`tests/unit/homeAnchors.test.ts` was written to settle
`nav-links-point-at-home-sections-the-page-no-longer-renders.md`, whose condition was that every
`/#…` link in `src` resolve to an id the home page renders. It did exactly that, was probed against
the unfixed tree, and named all four broken links at the ledger entry's own lines. It looked
finished.

The fix it was written for repointed `Footer.tsx:59` from `/#support` to
`/get-involved#volunteer`. The guard matched `["'`]\/#([A-Za-z0-9_-]+)`, which requires the `#` to
follow the leading slash — so the one link the fix *created* never matched, and neither did the four
`/get-involved#…` links already sitting in `Navbar.tsx`. Unmount `<section id="volunteer">` and the
footer link breaks in precisely the way the suite exists to prevent, with the suite green.

A second hole in the same file: the walk read raw source, so `{/* <HomeProcessSection /> */}` still
matched `RENDERED_COMPONENT` and kept `#how-it-works` alive. Three commented-out JSX blocks already
exist in this tree, so that was reachable, not theoretical.

Both survived a test-first pass, a green suite, and a mutation probe, because every check ran
against the defect as *originally reported* — four links of one shape on one page. Neither the
ledger entry nor the brief mentioned another shape, so nothing prompted the question.

**Rule:** after writing a guard, run its own matcher over the diff that accompanies it. Every
identifier the fix introduced — a new href, a new route, a renamed id — must appear in what the
guard collects, or the guard has a blind spot shaped exactly like the change. Then ask what the
smallest edit is that would reintroduce the defect *without* tripping it: commenting the line out,
moving it one directory over, writing it in a different but equivalent form. Probe that edit, not
only the original defect.
