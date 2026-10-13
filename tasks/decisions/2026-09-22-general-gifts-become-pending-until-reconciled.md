# A general gift is a pending pledge until a coordinator confirms the transfer

**Decided:** 2026-09-22 · closes `tasks/open/general-donations-issue-receipts-before-payment-is-reconciled.md`
(opened 2026-09-14, mirrored as GitHub issue #56; its text is in
`git log -- tasks/open/general-donations-issue-receipts-before-payment-is-reconciled.md`)

## What was wrong

`submitDonationPledgeAction` allocated an official `HFS-DON-*` LHDN Section 44(6) receipt the
moment the public donation form was submitted. Nothing had observed a bank statement at that
point: the donor was shown a DuitNow QR or the shelter's account details and told us they paid.
So the form minted filable tax documents, with gapless statutory serial numbers, for money the
shelter had not received — and anyone could do it, from an unauthenticated public form, as many
times as the rate limit allowed.

The open entry posed the fork: staff reconciliation, or a verified payment-provider callback.

## The fork, answered: staff reconciliation

**The webhook option was not built.** No payment processor is integrated anywhere in this repo.
`card` is refused at the action boundary before rate limiting because there is nothing behind it,
and `grep -ril webhook src/ prisma/` returns nothing. A public POST endpoint that mints statutory
receipts, with no provider and therefore no signature to verify, would be a worse hazard than the
one being closed. It remains available as a later option; nothing here forecloses it.

Staff reconciliation was already built, twice-reviewed, and running for pet sponsorships. The
general-gift lane is now its twin.

## The pending state could not live on `Donation`, and the brief was wrong about that

The supplied brief asked to "store the donation record in a pending status without assigning an
official receipt number" — a `status` column on `Donation`. That is unimplementable against
production and forbidden by this repo's own schema:

- **Production refuses it below the ORM.** `donations_no_mutation` has been live on the production
  branch since 2026-09-21 (`tasks/decisions/2026-09-21-production-receipts-are-append-only.md`).
  It rejects every UPDATE and DELETE on `donations`. A pending row inserted there could never be
  updated to attach its receipt number once confirmed, so the design would fail in production and
  pass in every other environment — the worst possible split.
- **The schema already rejected the idea in prose.** `PetSponsorship`'s model comment: "Modelling
  it as a mutable `Donation` would have meant putting a status column on a statutory document,
  which is exactly what that model's comment forbids."

So the pending state went into a new `donation_pledges` table, mirroring `PetSponsorship`.

**This makes the brief's fourth item stronger than it asked for.** It wanted LHDN export readers
to "filter out unconfirmed donation pledges". There is no filter. `fetchDonationReceiptsAction`
reads `donations`, and an unconfirmed gift is not in that table — it cannot reach an annual return
however the query is later changed. A filter is something a future reader can forget; a table
boundary is not. The defect being closed was a silent one, so structural beat conditional.

## What was built

- `DonationPledge` (`donation_pledges`): `status` as a plain String with a Zod boundary, matching
  `PetSponsorship` and deliberately not a Postgres enum — converting a text column to an enum here
  already cost one hand-written, rehearsed migration
  (`prisma/migrations/manual/20260917_status_enums/`), and this column earns none of that.
- `src/lib/server/donationPledgeLedger.ts`, the twin of `sponsorshipLedger.ts`. It reuses
  `withReceiptTransaction` and `drawAndInsert` from `donationLedger.ts`, which were exported for
  exactly this: "a caller that has a row of its own to write in the same transaction".
- `settleDonationPledge`: guard first, draw second, write third, inside one receipt transaction.
  The conditional `PENDING_PAYMENT → ACTIVE` update takes the row lock; a loser sees zero rows,
  has written nothing, and is handed the winner's number. Idempotency is the outcome type plus the
  unique index on `donation_pledges.receiptNumber`, not a convention.
- Three guarded Server Actions — list / reconcile / dismiss — behind the existing
  `RECONCILE_SPONSORSHIPS` permission, and a second queue on `/admin/donations`.
- `HFS-GFT-*` references, distinct from both the `HFS-DON` receipt series and the sponsorship
  `HFS-PLG` series, so a coordinator reading one bank statement knows which queue a line belongs
  to and a cross-table collision is impossible rather than unlikely.

## Choices someone could reasonably reverse

**A third table rather than generalising `pet_sponsorships`.** A general gift could have been a
`PetSponsorship` with a null pet. Rejected: `petName` is `NOT NULL` and `SponsorshipRecord.petName`
is read across the sponsor portal, the wall, the welcome email and the photo-update dispatch, so
making it nullable weakens a live invariant on a shipped feature across ~10 files. It would also
put a sentinel pet name into `Donation.targetPetName`, which is a dedication field, and send
"sponsorship welcome" mail for a general gift. The cost is a near-parallel ledger module; the
comments in each name the other so the pair stays visibly a pair.

**Two queues on one screen, not one merged table.** The references come from different series and
land in different tables. A coordinator matching `HFS-GFT-…` against a statement line should not
scan past sponsorship rows. The shared behaviour was extracted into
`src/components/admin/ReconciliationQueue.tsx` so the two cannot drift; each screen is now an
adapter naming its own actions.

**`DONATION_RECEIVED` moved from submission to reconciliation.** That action string is an
interface: `useAuditLogController`, `AuditLogViewer` and `exportCsv` each classify a row as a
donation receipt by it — or by the entity `DonationReceipt`, or by the mere presence of a
`receiptNumber` key in `details`. Submission now writes `DONATION_PLEDGED` on entity
`DonationPledge` and carries no `receiptNumber`, so it trips none of the three. The consequence is
deliberate: those three readers now count money the shelter has actually received.

**The on-screen printable receipt dossier is gone, not relocated.** Both copies (donation widget
and sponsorship modal) rendered an official receipt at submission time, which is the defect. There
is now no in-app view of an issued receipt; it arrives by email from
`reconcileDonationPledgeAction`. That matches what the sponsorship lane has always done. If
someone wants a donor-facing receipt view later, it belongs behind the sponsor portal, keyed on a
receipt that exists.

## Two consequences of moving the boundary, named rather than discovered later

**The receipt is dated when it is issued, not when the gift was made.** `settleDonationPledge`
defaults `when` to now, so `issuedAt` and the month the serial is drawn from both follow the
coordinator's confirmation. A gift sent on 30 December and matched on 2 January is receipted in
January, and the donor cannot file it against the year they paid. This is exactly what
`settleSponsorship` has done since 2026-09-14, so the two lanes agree — but for general gifts it
is a change: they used to be dated at submission.

Back-dating to `DonationPledge.createdAt` is not the fix. The serial is gapless *per month*, so a
January confirmation written into December's series would grow a month that has already been
filed, which is a worse statutory defect than a late date. A correct fix needs the value date from
the bank statement and a shelter policy for gifts that straddle a tax year. Marked as a `ceiling:`
on `settleDonationPledge`.

**The payment rail was a self-report the form never asked for — fixed 2026-10-13.** `/donate`
hardcoded `paymentMethod: "duitnow_qr"` while the same screen published the shelter's Maybank
account, so a bank-transfer donor was recorded on the wrong rail. That predated this change, but
this change gave the value a second consumer: the reconciliation queue shows it as the rail to
match against the bank statement. The form now asks, defaults to DuitNow QR, and switches to
bank transfer when the donor copies the account number. It is still the donor's word; the
statement is the authority.

## What would reverse this

Integrating a real payment provider. A verified, signature-checked callback is a stronger
issuance boundary than a coordinator's eye on a statement, and `settleDonationPledge` is already
the single funnel a callback would call. The `ceiling:` note in that function — and its twin in
`settleSponsorship` — says what a callback additionally needs: an operation id stored on the row,
so a same-actor retry after a lost acknowledgement can be told from a genuine second attempt.
Until then, reconciliation reports uncertainty rather than guessing, which is the correct
fail-closed behaviour for a statutory document.
