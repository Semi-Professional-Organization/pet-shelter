# A database trigger can make a brief unimplementable, and no schema file or drift check will say so

**Learned:** 2026-09-22

The brief for the donation-receipt boundary said, in its own words, to "store the donation record
in a pending status without assigning an official receipt number" — a `status` column on
`Donation`, and an UPDATE later to attach the receipt once payment was confirmed.

That design cannot run in production. `prisma/sql/donation_append_only.sql` installs a
`donations_no_mutation` trigger that raises on every UPDATE and DELETE of that table, and the
owner applied it to the production branch on 2026-09-21
(`tasks/decisions/2026-09-21-production-receipts-are-append-only.md`). A pending row written into
`donations` could be inserted anywhere, and updated only where the trigger was absent — so the
design would have passed every local test, passed CI, passed review against `prisma/schema.prisma`,
and failed for the first real donor.

Nothing on the usual path would have caught it:

- `prisma/schema.prisma` does not mention the trigger. Triggers are not Prisma objects.
- `npm run db:check-drift` **cannot see triggers**. That is stated in the decision file above, and
  it is why nobody knew for two weeks whether the guard had ever been applied.
- Local and CI databases are created by `db:push`, which never installs it — the file is opt-in,
  "apply it where receipts are real".

What did catch it was reading `tasks/decisions/` for the nouns of the task before designing. The
same directory also carried the design in prose: `PetSponsorship`'s model comment already said
"Modelling it as a mutable `Donation` would have meant putting a status column on a statutory
document, which is exactly what that model's comment forbids."

**Rule:** before designing a state machine on an existing table, establish what the *database*
enforces on it, not what the schema file declares. Grep `prisma/sql/` and
`prisma/migrations/manual/` for the table name, and read `tasks/decisions/` for it; a constraint
applied by hand to production lives in those files and in no generated artifact. When the answer
is "a trigger makes this table append-only", that is not a detail to work around — it is the
design already decided, and the new state belongs in a new table.
