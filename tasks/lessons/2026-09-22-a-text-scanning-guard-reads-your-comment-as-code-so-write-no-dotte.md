# A text-scanning guard reads your comment as code, so write no dotted names inside what it scans

**Learned:** 2026-09-22

Removing the two on-screen receipt dossiers left `.receipt-accent` and `.receipt-panel` declared
in `@layer components` in `src/app/globals.css` with no call site. The design-system guard in
`tests/unit/designSystemGuards.test.ts` caught it and said what to do: adopt or delete.

Deleting them was right. Explaining the deletion in a comment where they had been was not — the
guard failed again, now reporting three orphans:

    expected [ 'receipt-accent', 'receipt-panel', 'ts' ] to deeply equal []

The guard scans the raw text of that layer for `.name` patterns and does not strip comments. So
the comment naming the two classes it had just removed re-declared both, and
`designSystemGuards.test.ts` — written to cite the guard that caught it — declared a class called
`ts`. The fix was to write the same explanation without a single leading dot: `receipt-accent`,
`receipt-panel`, `tests/unit/designSystemGuards`.

The guard is not wrong to be text-based. A CSS-aware parser here would be a lot of machinery to
tell a comment from a rule, and the check earns its keep either way — it caught genuinely dead
CSS that a diff review would have missed, because the deletion was three files away.

**Rule:** when a guard works by scanning raw file text, treat that file's comments as part of its
input. Before explaining a removal in place, ask what the scanner will make of the sentence — and
write identifiers without the punctuation that makes them look like declarations. When you hit
this, leave the warning next to the comment rather than in the test, because the next person edits
the file, not the guard.
