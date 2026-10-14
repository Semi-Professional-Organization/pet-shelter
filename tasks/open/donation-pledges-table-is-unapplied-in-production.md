# The `donation_pledges` table is not applied to production

**Status:** open - opened 2026-09-22, narrowed 2026-10-13

`tasks/decisions/2026-09-22-general-gifts-become-pending-until-reconciled.md` moves general-gift
receipt issuance from form submission to staff reconciliation, on a new `donation_pledges` table.

**Until `prisma/migrations/manual/20260922_donation_pledges/migration.sql` is applied to the
production database, the deployed application cannot record a general donation.**
`recordDonationPledge` fails against the missing relation and every donor on `/donate` is told the
outcome is unconfirmed. This is a deploy-ordering constraint: apply the SQL first, then ship the
code. The reverse order breaks donations; this order breaks nothing, because the current code never
touches the new table.

## Do not use `db push`

Measured against the production branch on 2026-09-18, `npm run db:push` still proposes two
destructive statements unrelated to this change — see
`tasks/open/production-schema-has-drifted-ahead-of-master.md`. Apply the file itself.

## What has been verified, and what has not

Rehearsed on 2026-10-13 against a throwaway local PostgreSQL 18 whose schema was built by
`npm run db:push:local`:

    PASS  prisma db push built the table
    PASS  rollback.sql removes the table
    PASS  rollback.sql is safe to re-run
    PASS  migration.sql creates the table
    PASS  migration.sql is safe to re-run (shape unchanged)
    PASS  hand-written table is identical to the one Prisma's schema produces
    PASS  donations table still present

and `npm run test:db` ran green on the same server, 5 files / 42 tests, including the settle race
and both reference collisions.

**Not verified:** the file has never run against production, or against a copy of production's
schema, which differs from `prisma/schema.prisma` in ways the drift entry records. The migration
creates one new table and references no existing object, so that difference should not matter —
but that is reasoning, not a measurement. No session has production database access; the owner
applies it.

## How to apply and confirm

In the Neon SQL editor on the production branch, run the whole of `migration.sql`. Then:

    SELECT to_regclass('public.donation_pledges');
    SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'donations_no_mutation';

The first returns `donation_pledges`. The second must still show the append-only trigger enabled
(`O`); this migration does not touch it. Then `npm run db:check-drift` from the main checkout
should no longer list the table as additive.

## One production-data edit to make at the same time

The FAQ answer "Is my donation tax-deductible in Malaysia, and how do I receive an official
e-Receipt?" promised a receipt "generated instantly". The committed fixture `src/data/faqs.json`
is corrected, but production serves FAQs from its database, which the fixture only seeded. Edit
that answer in `/admin/faqs` when the code ships, or the live FAQ will contradict the donate page.

## Settles when

The table exists on production, confirmed by the two queries above, before the code that needs
it is deployed.
