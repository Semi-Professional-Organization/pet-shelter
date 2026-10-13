# An unknown pet status reads as Available, which is the one value that grants things

**Status:** open · opened 2026-09-22 · found by the third review of the adoption submission guard; read from the code, not reproduced against the production database

`fromDbPetStatus` in `src/lib/server/petMappers.ts` maps a persisted status to the domain one by
four exact, case-sensitive comparisons and a default:

    if (status === "In_Rehabilitation" || status === "In Rehabilitation" || status === "Rehabilitation") return "In Rehabilitation";
    if (status === "Pending") return "Pending";
    if (status === "Adopted") return "Adopted";
    return "Available";

So every value the mapper does not recognise — a different case (`adopted`, `ADOPTED`), a spelling
nobody anticipated, a column that drifted — becomes `Available`. Of the four statuses that is the
permissive one: `getPetStatusPresentation("Available").isAdoptable` is `true`, and the catalogue
lists it.

**This defeats the fail-closed reading of the presentation layer.** `getPetStatusPresentation`
falls back to the `pending` presentation (`isAdoptable: false`) for a status it does not know,
which reads like a safe default — and it is, but nothing unknown ever reaches it from a database
row, because the mapper has already turned it into `Available`. The fail-closed behaviour applies
only to values that bypass the mapper.

**What it costs now that the server checks status.** `submitApplication` refuses an animal whose
`isAdoptable` is false. A row holding `adopted` in the wrong case arrives as Available and the
application is accepted for an animal who has gone home — the exact defect that guard was added to
stop, surviving underneath it. The public catalogue lists that animal as adoptable for the same
reason, and `getPublicPets({ status: "Available" })` counts it.

**Why this is not hypothetical here.** The production Neon branch has held `Pet.status` as text
rather than the `PetStatus` enum — the enum's absence is recorded across this ledger and in the
migration work of 2026-09-21. A text column is exactly where case and spelling drift survive;
an enum column is what would have rejected them at write time. Whether any such row exists in
production today is **not known from here** — agents cannot read the production database, so this
is a code-level fail-open plus a plausible shape, not an observed row.

Not fixed with the guard that found it: the default sits in a mapper that every pet read goes
through — catalogue, admin table, filters, detail page, sponsorship — so changing it is a
repo-wide behaviour change with its own blast radius, not a line in one action. It is also not
obvious what it should become. `"Pending"` fails closed for adoption but puts the animal in the
adoptable *track*; throwing turns one bad row into a failed page render; a fifth `Unknown` status
is honest and touches every surface that switches on status.

**Settles when:** a status the mapper does not recognise cannot present as adoptable — whichever
of those three the repo picks, recorded with its reasoning — pinned by a unit test over
`fromDbPetStatus` asserting what `adopted`, `ADOPTED` and an arbitrary string become, and by a
strict-persistence test that arranges such a row and asserts `submitApplication` refuses it.
