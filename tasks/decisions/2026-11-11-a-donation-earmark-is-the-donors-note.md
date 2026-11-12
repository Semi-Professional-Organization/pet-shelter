# A donation earmark is the donor's note, not a verified animal

**Decided:** 2026-11-11, by the owner (option B of #205), implemented in the change that adds
this file.

`DonationWidget` seeds `targetPetName` from the `?pet=` query string, and
`submitDonationPledgeAction` stores it as written. So `/donate?pet=Tuah` records a gift
naming Tuah whether or not the shelter holds an animal by that name. The open entry this
settles (`donation-earmarks-are-free-text.md`, #205) asked whether the earmark should become a
pet id that the server checks with `findPetForWriteAsync`, refusing or dropping an unknown one
(option A), or stay free text and be labelled as the donor's own note (option B).

The owner chose **B**. The earmark stays free text in `targetPetName`, with no pet id, no lookup,
no schema change and no read of `src/data/pets.json`. What changed is how it is labelled:

- **Staff** see it as the donor's unverified text. The general-gift queue shows it on its own
  line, `Donor's note (dedication): “Tuah”`, where it said `<tier> · in honour of Tuah`. It is
  quoted and kept off the queue's `·`-delimited field line, so a note containing ` · Monthly · `
  cannot read as fields the queue states itself. The receipts CSV column is
  `Dedication / Sponsored Pet` where it was `Dedicated Pet` (see "Known imprecision").
- **The donor** sees "Your dedication" (Malay: "Dedikasi Anda") on the confirmation and in the
  pledge email, and "Dedication" on the acknowledgement, where these said "Dedicated Pet",
  "Dedicated Animal" or "In honour of". None of them claims a confirmed animal. The separate
  `notes` field keeps its own label ("Donor Message") so the two stay distinguishable.
- **On the form**, a `?pet=` name that matches no animal in the chooser is shown beside it as
  "Your dedication: Tuah" with a Remove button. Before this the chooser showed the general fund
  while the pledge still carried the name, so the donor first saw it after submitting. Choosing
  an animal or the general fund behaves as before.
- **Raw audit details** still show the value under its `targetPetName` key. The field is not
  renamed, by the same decision.
- **The contract** is written where the field is: `prisma/schema.prisma` (comments only, no
  migration), `src/lib/validations/donation.ts` and `src/actions/donations.ts`.

## Why B

- **A gift naming an animal is still a general gift.** The money goes to the shelter either
  way. A commitment to fund one animal's care already has its own record, a `PetSponsorship`,
  which does carry a verified pet id. Option A would have built a second, weaker version of that
  inside the general-gift path.
- **B loses nothing during a database outage.** A pet check on this path reads the catalogue,
  and in an outage it would either refuse the gift or, if it fell back to the mirror, check
  against fixture animals again. Free text needs no read at all, so the pledge records exactly
  what the donor wrote whatever state the database is in.

Left alone on purpose: `SponsorshipModal`'s "Dedicated Pet". That is a sponsorship of a pet the
server verified by id, so the label is true there.

## What would reverse it

Staff starting to act on the earmark as an allocation, for example spending a gift on the named
animal's care or reporting per-animal totals from it, would need the name to point at a real
animal. That is option A, and it should be a new dated entry naming this one. A pattern of
donors using `/donate?pet=` to commit to a specific animal would point the same way, or toward
sending them to the sponsorship flow.

## Known imprecision

`Donation.targetPetName` holds both kinds of value: the donor's note, copied from a
`DonationPledge` at reconciliation, and a sponsorship's verified pet name, copied by
`receiptDraftFor` in `src/lib/server/sponsorshipLedger.ts`. The receipts CSV prints both under
one column, so its header names both, `Dedication / Sponsored Pet`, and nothing on a row says
which it is. It is not called "Donor's Note", which would collide with the separate `notes`
field. Recorded in `tasks/open/donation-receipt-dedication-column-mixes-two-sources.md`.

Pinned by `tests/components/DonationEarmarkDonorNote.test.tsx` (the widget with `?pet=Tuah`
against a catalogue with no Tuah, before and after submitting and after Remove, and the staff
queue, including a note containing ` · `), `tests/unit/donationEarmarkIsDonorNote.test.ts` (the
action stores "Tuah", and "Kenanga", which no fixture holds, as written and calls no
pet-repository function), and the label assertions in
`tests/unit/email.test.ts` and `tests/unit/exportCsv.test.ts`.
