# A drifted pet status fails the whole Prisma read, not just its row

**Status:** ASSERTED · opened 2026-10-27 · found by review of #198, read from the code and not
reproduced against a database

`Pet.status` is the `PetStatus` enum in `prisma/schema.prisma`, while the production column has
held text. Prisma refuses to decode a value outside the enum, so a row holding `adopted` would make
`prisma.pet.findMany` throw before `fromDbPetStatus` sees it. `getServerPetsAsync` would then take
its outage `catch` and serve the mirror or `pets.json` for the whole catalogue.

#198 makes the mapper refuse an unrecognised status and read case drift correctly, which holds for
every route that reaches it (fixtures, the mirror, a raw query). Whether Prisma's typed reads can
reach it with a drifted value at all is not known from here: agents cannot read the production
database, and no test drives an off-enum value through the real client.

**Settles when:** an integration-db test (`npm run test:db`) writes an off-enum status with raw SQL
and asserts what the catalogue read does, or the production column is confirmed to be the enum.
