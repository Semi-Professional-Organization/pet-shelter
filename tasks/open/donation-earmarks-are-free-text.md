# A donation earmark is unchecked free text

**Status:** ASSERTED · opened 2026-10-27 · found by review of
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, reasoned from the code

That decision stopped the donation page seeding its animal chooser from `src/data/pets.json`. It
did not make the earmark trustworthy. `DonationWidget` seeds `targetPetName` from the `?pet=` query
string before any catalogue loads, and `submitDonationPledgeAction` stores
`validated.targetPetName` without checking it against any animal. So `/donate?pet=Tuah` still
records a gift earmarked for an animal production does not hold, and during an outage the
catalogue the chooser loads is itself the mirror (`getServerPetsAsync`'s `catch`), which may
offer fixture animals again.

The gift itself goes to the shelter either way; the earmark is what staff read when deciding what
the money is for. Whether it should name a verified animal by id, or stay free text and be
labelled as the donor's note, is a product question.

**Settles when:** either the donation pledge carries a pet id the server verifies with
`findPetForWriteAsync` and refuses or drops an unknown one, or the earmark is explicitly a
donor's note and staff see it labelled that way; pinned by a test posting `?pet=Tuah`.
