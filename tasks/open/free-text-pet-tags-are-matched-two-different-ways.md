# Free-text pet tags are matched two different ways

**Status:** open · opened 2026-10-30

`trainingKindFor` (`src/lib/domain/petTraining.ts`) ignores case, spaces, underscores, every dash
and pasted invisible characters, while `needsSocialising` (`src/lib/presentation/petStatusPresentation.ts`) only trims and
folds case, and `statusKey` (`src/lib/server/petMappers.ts`) folds case, spaces and
underscores but not dashes. So "house_trained" gets a Training row but "needs-socialising" is offered for
adoption instead of foster. Both guess meaning from a free-text field the admin form edits.

A NULL element in the `tags` column (written by SQL or an import, bypassing zod) still throws in
`needsSocialising`, `petSearch` and `adminPetFilters`; the read mapper (`petMappers.ts`) is the
one place that could drop it for every reader.

Related, same root: gallery search (`petSearch.ts`) substring-matches raw tags, so searching
the label the row shows ("house trained") misses pets tagged "House-Trained"; the litter box icon is a cat even on a dog's page, and combined tags such as
"House-Trained, Leash Trained" match nothing.

**Settles when:** tags that carry meaning get one shared key helper, or move to structured fields
(training flags beside `compatibility`, or the unused PetTag table).
