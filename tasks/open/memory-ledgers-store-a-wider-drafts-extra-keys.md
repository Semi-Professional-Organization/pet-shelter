# The in-memory ledgers store whatever extra keys a draft object carries

**Status:** open · opened 2026-11-05

`recordSponsorshipPledge`, `recordDonationPledge` and `issueReceiptInMemory` build their memory
record with `...draft`. Until #251 each also overrode `taxIdOrIc: undefined`, so a wider object
could not smuggle an NRIC into memory mode. With the field gone from every type that override had
nothing to name, and was removed. The Postgres branches write an explicit field list and are not
affected, and every real caller passes a Zod-parsed object, which strips unknown keys.

Found by the #251 review and declined there: memory mode is the offline/test ledger, and no
production path reaches it with `DATABASE_URL` set.

**Settles when:** the memory branches copy the draft's declared fields explicitly, as the Postgres
branches do, or someone decides the offline ledger does not need that guarantee.
