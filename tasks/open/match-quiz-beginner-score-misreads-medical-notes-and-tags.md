# The match quiz's first-time-owner score misreads medical notes and tags

**Status:** open · opened 2026-10-30

Found by the reviews of the pet training icons branch (`claude/pet-training-icons`), outside
its scope, in `calculatePetMatchScore` (`src/lib/domain/matchEngine.ts`, experience match):

- **Any medical note counts as special needs.** `isSpecialNeeds = !!pet.medical.specialNeeds`,
  and all 10 seed pets carry a routine note ("Healthy. Vaccinations ... up to date."), so every
  one scores 12 of 25 for a first-time owner and shows the caution "Requires special medical or
  dietary attention". The beginner branch never fires for seed data.
- **Temperament words are substrings.** `/gentle|friendly|easy/i` matches "Unfriendly",
  "Uneasy" and "Not gentle", so a pet tagged that way scores 25 with the reason "Gentle &
  beginner-friendly demeanor".
- **The reason names temperament even when only house training matched.**
- **Litter box training earns nothing.** A cat with a green "Litter Box Trained" badge scores
  20 where a house-trained dog scores 25. Whether it should is the owner's call.

**Settles when:** the owner decides how the experience score should read medical notes and
litter box training, and the quiz is changed (or this is closed as accepted).
