# Three behaviours lost their only (hollow) tests and now have none

**Status:** open · opened 2026-10-20 · found while deleting tests that could not fail

Removing tests that asserted on values they built themselves left three behaviours with no test at
all. Nothing regressed: those tests never exercised the code, so the coverage was already zero. The
gap is just visible now.

1. **`/api/upload` refusals.** The 403 branches (`src/app/api/upload/route.ts`, the two
   admin-session checks) and the signature-mismatch branch are untested. `tests/unit/upload.test.ts`
   mocks the admin session to always allow; the deleted `tests/unit/upload.fixes.test.ts` tested
   local `vi.fn`s and imported nothing from `src`.
2. **`replacePet`** in `src/lib/client/petStore.ts`, which the admin pet table uses to roll back an
   optimistic edit (`usePetTableController.ts`). The deleted block in
   `tests/unit/adminStatusWriteback.test.ts` asserted on a literal it built.
3. **Newest-first ordering of a pet's updates** in `PetDetailView`. The deleted test in
   `tests/unit/petDetailTabsAndSponsorship.test.ts` sorted its own array.

**Settles when:** each has a test that calls the real code and fails when the behaviour breaks
(checked by breaking it once), or a decision entry says the behaviour does not need one.
