# A profile rendered during an outage can stay cached after it

**Status:** ASSERTED · opened 2026-10-27 · found by review of
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, reasoned from the code
and Next's `generateStaticParams` docs, not reproduced

That decision lets a page show a `src/data/pets.json` animal for the length of an outage, on the
ground that a page recovers. `/pets/[id]` has `generateStaticParams` and no `revalidate`, so a
profile path that was not prerendered is rendered on its first visit and then cached. If that
first visit falls inside an outage, `getPetById` answers from the mirror and the demo animal is
what gets cached, and nothing revalidates a path for an id the database does not hold. A build
that cannot reach the database freezes the prerendered profiles the same way. `/pets` was made
`force-dynamic` for this reason; the profile was not.

**Settles when:** a profile rendered from the mirror is not served after the database recovers —
by rendering the profile dynamically, by revalidating it, or by not caching a mirror-sourced
render — pinned by a test or a recorded build observation.
