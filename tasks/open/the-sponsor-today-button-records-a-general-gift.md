# The "Sponsor {pet} Today" button and the donation form promise a sponsorship but record a general gift

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

The donation form makes the same promise in its own copy:

- The chooser's heading is "Dedicate Sponsorship to a Specific Animal" (`donations.choosePetTitle`,
  `src/components/features/donations/PetChooserCarousel.tsx`; Malay "Dedikasikan Penajaan Kepada
  Haiwan Tertentu").
- The perks panel reads "Rescue Companion & Updates — {pet}"
  (`src/components/features/donations/DonationWidget.tsx`, `donations.companionTierTitle`) once an
  animal is chosen, beside the monthly and kibble perks.

Choosing an animal there also records only a dedication on a general gift.

**Settles when:** the button opens the sponsorship flow for that pet, or its copy, the profile's
panel, the chooser's heading and the widget's perks panel stop promising a sponsorship of an animal.
Either is pinned by component tests of `PetDetailView` and `DonationWidget` that assert where the
button leads, or what the copy says.
