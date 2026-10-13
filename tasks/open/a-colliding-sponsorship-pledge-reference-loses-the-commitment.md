# A colliding sponsorship pledge reference loses the supporter's commitment

**Status:** open - opened 2026-09-22

`generatePledgeRef` produces `HFS-PLG-<UTC day>-<6-digit random>` and
`pet_sponsorships.pledgeRef` is `@unique`, so two supporters checking out on the same day can draw
the same serial. `recordSponsorshipPledge` (`src/lib/server/sponsorshipLedger.ts`) catches only
`isForeignKeyViolation`; a P2002 on that column falls through to
`throw new SponsorshipWriteError(...)`, which `createPetSponsorshipAction` surfaces as
`SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE`.

That message tells the supporter the outcome could not be confirmed and to check with the shelter
before retrying — which is the correct thing to say when a write outcome is genuinely unknown, and
the wrong thing to say here. The write definitely did not happen, a retry is definitely safe, and
a fresh reference would have worked. The commitment is lost, and the supporter is discouraged from
trying again.

The odds are not remote: 900,000 values scoped to one day means roughly a 2% chance per day at
about 200 pledges, rising quadratically with volume.

## Why this is filed rather than fixed

The identical defect on the general-gift lane was found in review of the receipt-boundary work and
fixed there, in `recordDonationPledge`: a P2002 naming `pledgeRef` redraws the reference and
inserts once more, a second collision propagates, and a collision on the *other* unique is
deliberately not retried. `isPledgeRefCollision` in `src/lib/server/donationPledgeLedger.ts` is
the predicate, and `tests/unit/donationPledgeRefGuard.test.ts` covers the error shapes.

It was not fixed for sponsorships in the same change because that is a separate, shipped, reviewed
write path with its own foreign-key recovery branch, and the receipt-boundary branch had already
taken three rounds of review by the time this was found. Widening it into the sponsorship write
path at that point is how a fix round introduces a defect — which that branch had already
demonstrated once.

Both lanes now draw their reference from the same `generateContributionRef`, so the fix should be
shared rather than copied: lift the predicate somewhere both ledgers already import (they share
`donationLedger.ts`) and give `recordSponsorshipPledge` the same retry, leaving its foreign-key
branch alone.

## The error shape, measured — and a second reader that has it wrong

Whoever writes this fix must not key on `meta.target`. On Prisma 7 with `@prisma/adapter-pg` a
P2002 never carries it: the runtime builds the error as `{ driverAdapterError }`, and the violated
columns sit at `meta.driverAdapterError.cause.constraint.fields`, parsed by the adapter from
Postgres's `Key ("pledgeRef")=(...) already exists` detail line (so a mixed-case column arrives
with its quotes on). Read on 2026-10-13 from `node_modules/@prisma/client/runtime/client.js` and
`node_modules/@prisma/adapter-pg/dist/index.js`. `uniqueViolationColumns` in
`src/lib/server/donationPledgeLedger.ts` reads both shapes and is the thing to lift and share.

The gift lane's own predicate had this wrong for two commits — it discriminated on `meta.target`,
so its column guard was dead code and its tests passed on a fabricated error object.

**`isReferenceCodeCollision` in `src/actions/applications.ts` has the same mistake and is live.**
It reads only `meta.target`, so on this stack it always sees an empty string, returns `false`, and
`insertWithUniqueReferenceCode` never retries: a colliding adoption reference code surfaces as a
write failure instead of being redrawn. Read from the source, not observed against a database —
Tier 3b could not run here — so treat it as a strong belief and probe it first.

## Settles when

A P2002 on `pet_sponsorships.pledgeRef` redraws the reference and keeps the commitment, with a
test covering the retry, the second collision, and the unique that must not be retried.
