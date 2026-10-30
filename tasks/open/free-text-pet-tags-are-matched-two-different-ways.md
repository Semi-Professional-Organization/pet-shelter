# Free-text pet tags are matched two different ways

**Status:** open · opened 2026-10-30

`trainingKindFor` (`src/lib/domain/petTraining.ts`) ignores case, spaces, underscores and every
dash, while `needsSocialising` (`src/lib/presentation/petStatusPresentation.ts`) only trims and
folds case. So "house_trained" gets a Training row but "needs-socialising" is offered for
adoption instead of foster. Both guess meaning from a free-text field the admin form edits.

Related, same root: training appears twice on the About tab (the raw chip and the Training row),
the litter box icon is a cat even on a dog's page, and combined tags such as
"House-Trained, Leash Trained" match nothing.

**Settles when:** tags that carry meaning get one shared key helper, or move to structured fields
(training flags beside `compatibility`, or the unused PetTag table).
