# The site promises free adoption in a dozen places, while every adoption fee is configurable

**Status:** open · opened 2026-10-14 · inventoried at `7e241bf`

This is a policy question for the shelter, not a defect a developer can settle. It is recorded
because the two halves contradict each other in code, and nothing on screen shows it yet.

## The promise

"Free" or "100% free" adoption is stated, unqualified, in at least these places:

| Where | Text |
|---|---|
| `HomeSections.tsx` — `HomeOurWorkSection`, pillar 3 | "100% free adoptions for cleared animals" / "Adopsi percuma 100% setelah sembuh sepenuhnya" |
| `HomeSections.tsx` — `HomeStandardsSection` | "100% Free Adoption Policy" / "Polisi Adopsi Percuma 100%" |
| `Navbar.tsx` — the Adoption Process link | "Step-by-step 100% free adoption guide" / "Panduan 3-langkah adopsi percuma 100%" |
| `DonatePageView.tsx` | "100% Free Adoption Guarantee" / "Jaminan Adopsi 100% Percuma" |
| `PetCard.tsx`, `applications/track/page.tsx` — `common.freeAdoption` | "Free Adoption" / "100% Free Adoption" |
| `AdoptionWizard.tsx:231`, and the submit button at `:536` | "Free Adoption"; "Submit 100% Free Adoption Application" |
| `src/lib/email.ts` — applicant emails, lines 321, 352, 465 | "complete the 100% free adoption formalities", and similar |

## The configuration

The fee is not fixed. `src/actions/settings.ts` exposes `adoptionFeeDog` and `adoptionFeeCat` as
shelter settings, and every pet carries its own `adoptionFee`, editable in `PetFormDialog`.
`PetDetailView.tsx:196-200` and `PetDetailDialog.tsx:97` render that value verbatim whenever it does
not contain "free". So a member of staff who sets a dog's fee to "RM 150" produces a pet page
showing RM 150 beneath a site that promises, in eleven places, that adoption is free.

**Nothing contradicts on screen today**: all ten seeded pets have `adoptionFee: "Free"`.

## The wording that already reconciles them

The site's most careful copy is qualified: `home.protocol2Desc` — "We do not sell animals or charge
**commercial** adoption fees" — and `home.howItWorksSubtitle` — "zero **commercial** adoption fees".
"Commercial" leaves room for a cost-recovery fee and still states the policy. On 2026-10-14 step 3 of
the adoption process moved to the same wording ("no commercial adoption fees"), after two earlier
versions — "no hidden fees", which implied visible ones, and "zero adoption fees", which promised
more than the admin screens enforce. See
`tasks/decisions/2026-09-22-home-anchors-remount-the-process-section-and-repoint-support.md`.

## Not decided here

Whether the shelter's policy is "free", or "no commercial fee", is the shelter's to state. Changing
eleven customer-facing promises — three of them in emails applicants have already received — on a
developer's reading of the settings screen would be the wrong way round.

**Settles when:** the shelter states the policy, and either every promise above matches it, or the
fee settings are constrained so they cannot contradict it (for instance, removed, or limited to
"Free"). The decision is recorded in `tasks/decisions/`.
