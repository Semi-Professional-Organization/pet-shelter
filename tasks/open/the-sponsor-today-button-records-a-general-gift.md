# The "Sponsor {pet} Today" button records a general gift, not a sponsorship

**Status:** ASSERTED · opened 2026-11-11 · found by review of #205, read from the code

The pet profile's support tab (`src/components/features/pets/PetDetailView.tsx`) is headed
"Monthly Rescue Companion (RM 30/mo)". It says "Sponsor {pet} monthly to receive personalized
updates" and lists monthly photo reports, a digital certificate and sanctuary visits. Its main
button, "Sponsor {pet} Today" ("Taja {pet} Sekarang"), links to
`/donate?pet=<name>&sponsorPetId=<id>&tier=kibble`.

What that link records is a general gift, not a sponsorship:

- `DonationWidget` uses `sponsorPetId` only to preselect the animal in the chooser. The payload
  it posts to `submitDonationPledgeAction` has no pet id, and the schema has none, so the
  verified id is dropped.
- No `PetSponsorship` is created. The perks are tied to the sponsorship flow, which the sibling
  "Other Giving Options" button opens through `SponsorshipModal`.
- Staff see the animal only as the donor's note on a general gift, which since #205 is labelled
  `Donor's note (dedication)` (`tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md`).
- The link sets no `freq=monthly`, so the form opens on a one-time RM 30 gift, not the
  RM 30 a month the heading names.

So a supporter who clicks the button is promised a sponsorship of that animal and its perks. What
gets recorded is a one-time general gift with the animal's name as an unverified note.

**Settles when:** the button opens the sponsorship flow for that pet, or its copy and the panel
stop promising a sponsorship and its perks. Either is pinned by a component test of
`PetDetailView` that asserts where the button leads or what it says.
