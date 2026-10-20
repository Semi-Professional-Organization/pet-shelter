# Eight tests each walk src/ with a walker of their own

**Status:** open · opened 2026-10-20 · counted during a review of the test-harness branch

Guards that read the source tree (`designSystemGuards`, `docReferences`, `layerBoundaries`,
`homeAnchors`, `shelterIdentity`, `verifiedSessionOnly`, and from the test-harness branch
`hermeticEnvCoversTheCode` and `stateResets`) each list the files under `src/` themselves, with
different extension filters and path handling. A change to what counts as source (a new extension,
a generated folder to skip) has to be made in each, and the guards already disagree on the file
set.

**Settles when:** one helper under `tests/support/` lists and reads `src/` once per file, and every
guard uses it, with any guard that needs a different file set saying why.
