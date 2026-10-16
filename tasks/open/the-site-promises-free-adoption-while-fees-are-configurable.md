# The site promises free adoption in twelve places, while each pet's fee is free text staff can edit

**Status:** open · opened 2026-10-14 · inventoried at `88a57f2`, each item read in context

This is a policy question for the shelter, not a defect a developer can settle. It is recorded
because the two halves contradict each other in code.

## The promise

Free adoption is stated without qualification in these twelve places. Each was read in its source,
not matched by a search; an earlier version of this list counted wrongly in both directions, and
the corrections are noted below the table.

| # | Where | Text | Shown |
|---|---|---|---|
| 1 | `PetCard.tsx:65` — `common.freeAdoption` | "Free Adoption" badge | on **every** pet card not in rehabilitation, whatever that pet's fee |
| 2 | `applications/track/page.tsx:270` — `common.freeAdoption` | "100% Free Adoption" badge | beside the pet's name on every tracking result |
| 3 | `applications/track/page.tsx:417-419` | "complete the 100% Free Adoption formalities" / "urusan Adopsi 100% Percuma" | to an applicant whose application for a **named pet** was approved |
| 4 | `HomeSections.tsx` — `HomeOurWorkSection`, pillar 3 | "100% free adoptions for cleared animals" | home page |
| 5 | `HomeSections.tsx` — `HomeStandardsSection` | "100% Free Adoption Policy" | home page |
| 6 | `Navbar.tsx` — the Adoption Process link | "Step-by-step 100% free adoption guide" | every page |
| 7 | `DonatePageView.tsx:153` | "rehomed through our Free Adoption policy" | `/donate` |
| 8 | `DonatePageView.tsx:168` | "100% Free Adoption Guarantee" | `/donate` |
| 9 | `AdoptionWizard.tsx:536` | "Submit 100% Free Adoption Application" | the adoption form's submit button |
| 10 | `src/lib/email.ts` — `sendApplicationConfirmationEmail`, lines 321 and 352 | "complete the 100% free adoption formalities"; "(100% Free Adoption)" | one email to every applicant — 321 is its plain-text part and 352 its HTML part |
| 11 | `src/lib/email.ts:787` — the donation receipt | "free adoption placements" | every donor |
| 12 | `src/lib/domain/medicalTimeline.ts:125` | "Disahkan 100% sihat untuk adopsi percuma" | Malay only — the English reads "signed for rehoming" and makes no fee claim |

**Corrections to the first version of this list.** It said eleven places including "three applicant
emails"; there are two emails, and only one goes to applicants — lines 321 and 352 are two parts of
the same message. It included `email.ts:465`, which says the *medical records* are free of charge,
not the adoption. It included `AdoptionWizard.tsx:231`, which shows "Free Adoption" only when the
pet's fee says so and otherwise shows the real fee — that one already behaves. And it missed four
real promises: rows 3, 7, 11 and 12. Its title said "a dozen" while its body said eleven.

## The configuration

Each pet's `adoptionFee` is a free-text field, defaulting to "Free" in `PetFormDialog.tsx:80,168`
and editable there by staff. `PetDetailView.tsx:196-200` and `PetDetailDialog.tsx:97,189` render it
verbatim whenever it does not contain "free". So a pet set to "RM 150" shows RM 150 on its own page
— while its card in the gallery still carries row 1's "Free Adoption" badge, and an approval for it
promises row 3's "100% Free Adoption formalities".

The shelter settings `adoptionFeeDog` and `adoptionFeeCat` (`src/actions/settings.ts`) look like
the fee controls but are read by nothing outside the settings code itself — the store, repository,
validation and admin form. No public page uses them. Changing or locking them would not touch the
contradiction above.

**Whether anything contradicts on screen today is ASSERTED, not observed.** Every seeded pet has
`adoptionFee: "Free"` (`src/data/pets.json`, `prisma/seed.ts`). The production `pets` table is
editable by staff and could not be read from this session, so a non-"Free" value may already be
live.

## The wording that already reconciles them

The site's most careful copy is qualified: `home.protocol2Desc` — "We do not sell animals or charge
**commercial** adoption fees" — and `home.howItWorksSubtitle` — "zero **commercial** adoption fees".
"Commercial" leaves room for a cost-recovery fee and still states the policy. On 2026-10-14 step 3 of
the adoption process moved to that wording, after two earlier versions — "no hidden fees", which
implied visible ones, and "zero adoption fees", which promised more than the per-pet field
enforces. See `tasks/decisions/2026-09-22-home-anchors-remount-the-process-section-and-repoint-support.md`.

## Not decided here

Whether the shelter's policy is "free", or "no commercial fee", is the shelter's to state. Rewriting
twelve customer-facing promises — including one email every applicant receives and one every donor
receives — on a developer's reading of an admin form would be the wrong way round.

**Settles when:** the shelter states the policy, and then either every promise above matches it, or
the **per-pet `adoptionFee` field** is constrained so it cannot contradict it — for instance, limited
to "Free" or removed. Constraining `adoptionFeeDog`/`adoptionFeeCat` alone does not settle this;
nothing public reads them. The decision is recorded in `tasks/decisions/`.
