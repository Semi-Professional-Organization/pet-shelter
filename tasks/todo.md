<!--
  This file still has the collision defect that `tasks/lessons.md` was split to remove on
  2026-09-09: one file, one append point, written by every concurrent session. A conflict here
  costs a pull request its whole CI run, because GitHub builds no merge commit for a conflicted
  PR — see `tasks/decisions/2026-09-09-lessons-become-one-file-per-lesson.md`.

  It was left as one file deliberately: these are work-stream write-ups with far less uniform
  structure than a lesson, so splitting them is its own task, not a ride-along. Until then,
  prepend a new stream at the top and do not reformat what is below it.
-->

# Active Work Streams

Historical completed work streams (August-September 2026) have been archived to [tasks/archive/todo-historical-streams.md](archive/todo-historical-streams.md).

Record active multi-step work streams below.

# Donation receipts wait for reconciliation

**Branch:** `worktree-donation-receipt-reconciliation-boundary` · opened 2026-09-22
**Settles:** `tasks/open/general-donations-issue-receipts-before-payment-is-reconciled.md` (issue #56)

## The brief, and where it was wrong

The brief asked to "store the donation record in a pending status without assigning an official
receipt number" — i.e. a `status` column on `Donation`. That is unimplementable against
production and forbidden by this repo's own schema:

- `donations_no_mutation` has been live on the production branch since 2026-09-21
  (`tasks/decisions/2026-09-21-production-receipts-are-append-only.md`). It refuses every UPDATE
  and DELETE on `donations`. A pending row inserted there could never be updated to attach its
  receipt number, so the reconciliation step would fail in production and nowhere else.
- `prisma/schema.prisma` already rejects the idea in prose, where `PetSponsorship` explains why it
  is not a `Donation`: "Modelling it as a mutable `Donation` would have meant putting a status
  column on a statutory document, which is exactly what that model's comment forbids."

So the pending state goes in a new `donation_pledges` table, mirroring the shipped
`PetSponsorship` → `settleSponsorship` pattern. This makes the brief's item 4 stronger than it
asked for: the LHDN export reads `donations`, so an unconfirmed pledge is structurally invisible
to it. There is no filter to forget.

The brief's "or webhook callback" is **not built**. No payment processor is integrated, `card` is
refused before rate limiting, and `grep -ril webhook src/ prisma/` returns nothing. Adding a
public POST endpoint that mints statutory receipts, with no signature to verify, would be a worse
hazard than the one being closed. Staff reconciliation is the boundary; the webhook is recorded
as the deferred option.

## Items

- [x] `DonationPledge` model + hand-written idempotent migration (never `db push`), with
      `rollback.sql`. **Applied nowhere** - see the new open entry.
- [x] `src/lib/server/donationPledgeLedger.ts`: pledge, settle, reject, pending queue
- [x] `submitDonationPledgeAction` returns a pledge, not a receipt
- [x] Staff actions: list / reconcile / reject, behind the existing reconciliation permission
- [x] Audit: `DONATION_PLEDGED` at submit (no `receiptNumber` in details), `DONATION_RECEIVED`
      moves to reconciliation
- [x] Tax-neutral acknowledgement email at pledge; receipt email only at reconciliation
- [x] Admin queue renders pending gifts beside pending sponsorships, via one extracted
      `ReconciliationQueue` rather than a second copy
- [x] Donor-facing acknowledgement replaces the receipt screen (EN + MS)
- [x] Tests: no receipt before reconciliation, idempotent double-confirm, export blind to pledges
- [x] Settle the open entry into `tasks/decisions/`

## Review

**Verification.** `typecheck` clean. `test` (unit) 99 files / 1596 tests, all green. `test:components`
11 / 170 green. `test:integration` 6 / 59 green. `lint` 0 errors, 13 warnings, every one of them
pre-existing and in a file this branch never touched. `docs:check` and the layer graph both OK.
`build` succeeded with throwaway secrets inline, after `npm ci` in the worktree.

**The one gate that could not run: `npm run test:db`.** Docker will not start on this machine
(`unable to get image 'postgres:16-alpine': failed to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine`), so Tier 3b never executed and
`tests/integration/db/donationPledgeLedger.postgres.test.ts` is new, typechecked, and **never
run**. It is the only coverage of the row-lock guard, the serial rolling back with a loser's
transaction, and the unique index behind them. Recorded as
`tasks/open/donation-pledges-table-is-unapplied-and-its-postgres-probe-unrun.md` with the command.

**A transient local Postgres made an earlier run look far worse than it was.** Midway through the
session a native server was listening on `localhost:5432`; `src/lib/server/prisma.ts` falls back to
a hardcoded localhost URL when `DATABASE_URL` is unset, so unit suites written for the in-memory
branch hit it and failed on leftover rows - 65 tests across 16 files, reproduced identically in the
pristine main checkout at `b44f857` before concluding anything. It had stopped by the final run,
which is green. Worth knowing before anyone reads a red unit run here as a regression.

### Code review, and the fix round

`/code-review high` over the whole branch diff returned six findings, each verified by probe
before it was accepted. One was medium and the rest low; all six are fixed:

1. `assertGiftRefString` ran inside `withReceiptTransaction` on the Postgres path, so a malformed
   reference came back as `ReceiptIssuanceError` rather than `TypeError` — an outage message for a
   programming error, and a disagreement between the two storage modes. Hoisted above the mode
   branch. `tests/unit/donationPledgeRefGuard.test.ts` is the new guard; it was confirmed to fail
   against the unfixed code before being kept.
2. The LHDN CSV fallback fills "Donor Email" from `entry.actorEmail`, which is now the coordinator
   rather than the donor. `exportCsv.ts` prefers `details.donorEmail` and keeps `actorEmail` as the
   fallback for older rows.
3. The migration's advisory lock used `4210771004` while every sibling uses `4210771001`, so its
   own comment about queueing against them was false. Aligned.
4. `isGiftRef` was dead and its docstring claimed a boundary it did not enforce. Wired into
   `giftRefSchema`, so a receipt number pasted into the queue is rejected on shape.
5. `useSponsorshipStore`'s contract still said `submitDonationPledgeAction` returns a
   `DonationReceipt`. Corrected, including why the hook is kept rather than deleted.
6. `prisma/schema.prisma` and the boundary test cited the open entry this branch deletes. Both now
   point at the decision file.

A second `/code-review high` over the fix commit returned six more, again each probed:

1. **Receipt dating.** The receipt now carries the confirmation date, not the gift date, so a
   year-end gift can land in the next tax year. Kept — it matches `settleSponsorship`, and
   back-dating would grow a month's gapless series after it was filed — but named as a `ceiling:`
   and written into the decision file rather than left to be discovered by a donor.
2. **`hasMore` was computed and never rendered**, so both queues truncated silently at 200 on a
   queue fed by an unauthenticated form. Now surfaced, which fixes the sponsorship lane too.
3. **`/donate` hardcodes `duitnow_qr`** while publishing the Maybank account, so a bank-transfer
   donor's receipt and queue row both name the wrong rail. Pre-existing; this change gives it a
   second consumer. Not fixed here — it needs a rail selector on the public form — and recorded as
   its own open entry.
4. **A `pledgeRef` collision lost the gift.** The reference is a 6-digit daily random, so ~200
   gifts a day carries roughly a 2% daily chance of a collision, which surfaced as "we could not
   confirm" — losing a real submission and telling the donor not to retry. Now redraws once, with
   three tests covering the retry, the second collision, and the `receiptNumber` unique that must
   *not* be retried.
5. **The donor-email fix was incomplete**: `SPONSORSHIP_RECONCILED` rows are classified as
   donations by the `receiptNumber` test and carry `sponsorEmail`, so they still exported the
   coordinator. Both spellings are now checked, and `sponsorName` was added to that audit row so
   the export stops calling reconciled sponsors "Anonymous Donor".
6. **Deploy ordering** — already tracked; see the open entry and the PR description.

A third `/code-review high`, over the second fix commit, returned four more:

1. **The sponsorship export fix was itself half a fix, and the half it left was the money.**
   `exportCsv` reads `amountMYR` and nothing else for the amount column, and the
   `SPONSORSHIP_RECONCILED` audit row carried only `amountSen`/`amountDisplay`. So the previous
   commit gave those rows a real supporter name and address — making them look authoritative —
   while the LHDN amount column still read `0.00`. The row now carries `amountMYR`, plus the tier,
   frequency, rail and dedication the exporter was otherwise inventing as "Rescue Donation" and
   "DuitNow QR". `taxIdOrIc` is deliberately still absent: an audit row is not somewhere to widen
   where an NRIC is stored.
2. **The collision retry was gated on `meta.modelName`**, which nothing in this repo has observed
   Prisma populating for a `donationPledge.create`. If it is absent the predicate returns false,
   the retry never fires, and the donor loses the gift exactly as before — silently. The call site
   is the discriminator (this only ever wraps one `create`), so the check is now on `meta.target`
   alone, with tests for the no-`modelName` and index-name shapes.
3. **The truncation banner had no test.** Two added, both directions.
4. A collision case was added to the Postgres suite, since that tier is the only place the *real*
   P2002 shape is observable — still unrun here.

A fourth and a fifth round followed, each over the previous round's fix commit:

- **Round four** found that the amount fix reached only rows written from then on: every
  reconciled sponsorship already in audit history carries `amountSen` and no `amountMYR`, so they
  still exported RM 0.00. The exporter now reads the sen, and an unknowable amount is an empty
  cell rather than a claimed zero. It also filed two pre-existing defects as open entries — the
  sponsorship lane's identical reference collision, and the two lanes disagreeing about an NRIC
  in the audit row.
- **Round five** found the collision predicate keyed on a field this client never sets. On Prisma
  7 with `@prisma/adapter-pg` a P2002 has no `meta.target`; the columns are at
  `meta.driverAdapterError.cause.constraint.fields`. So the `receiptNumber` guard was dead code
  and its tests passed on a fabricated error. `uniqueViolationColumns` now reads the real shape,
  with tests on it, one of which was confirmed to fail against the old code. The audit viewer and
  the CSV exporter also now share one amount resolver, which prefers the exact sen.

Not fixed from round five, and why: a receipted row whose amount cannot be resolved is still
exported, with an empty amount cell and no operator notice. Dropping a receipted row from a tax
export is worse than showing it incomplete, and a notice is a UI change to `useAuditLogController`.

### Deliberately not done

- **No payment webhook.** The open entry offered it as the other fork. There is no processor
  integrated anywhere, `card` is refused before rate limiting, and `grep -ril webhook src/ prisma/`
  is empty. An unauthenticated public POST that mints statutory receipts, with no signature to
  verify, is a worse hazard than the one being closed. `settleDonationPledge` is the single funnel
  a callback would later call.
- **`pet_sponsorships` was not generalised to carry general gifts.** It was the smaller-looking
  option and it is rejected in the decision file with the reasons: `petName` is `NOT NULL` and read
  across ~10 files in the sponsor portal, and a sentinel pet name would land in
  `Donation.targetPetName`, which is a dedication.
- **No in-app view of an issued receipt.** Both printable dossiers rendered at *submission* time,
  which was the defect, so both are gone rather than relocated. The receipt now arrives by email,
  exactly as the sponsorship lane has always worked. A donor-facing receipt view belongs behind the
  sponsor portal, keyed on a receipt that exists; that is not built.
- **`--receipt-panel` is left declared with no consumer.** Removing the two dead component classes
  orphaned that one token. The repo's own guard polices `@layer components`, not `@theme` tokens,
  and the rest of the `receipt-*` family is still in use by the sponsor certificate; pulling one
  token out of a coherent family is churn into the design system for ~40 bytes.
- **`useSponsorshipStore.saveDonationReceipt` now has no caller.** Left in place: it is the client
  receipt store, and the right fix is a portal receipt view, not deleting the store on the way past.
- **The idempotency `ceiling:` is inherited, not closed.** A same-actor retry after a lost commit
  acknowledgement still reports uncertainty rather than guessing. Closing it needs an operation id
  on the row, and it should be closed for `settleSponsorship` at the same time - both functions
  carry the note.


# Adoption submissions validate their target animal

**Branch:** `worktree-adoption-submit-guards` · opened 2026-09-22 · base `8d36ace`
**Settles:** `tasks/open/submit-application-checks-a-fixture-and-no-status.md` (deleted with this work)

## Items

- [x] Audit the brief against the tree before implementing. All three server gaps and both client
      halves confirmed live at `src/actions/applications.ts:107-114` and
      `src/hooks/useAdoptionFormController.ts:60-61`. Nothing in flight on either file.
- [x] Gap 1 — `findServerPetByIdAsync`, so the archive flag comes from Postgres, not `pets.json`.
- [x] Gap 2 — reject a pet that is not found, **and** one whose id is not exactly the one posted.
      The swap alone does not close this; see Review.
- [x] Gap 3 — reject any pet whose `getPetStatusPresentation(status).isAdoptable` is false.
- [x] Moved the lookup behind both rate-limit budgets — it became a database query.
- [x] `resolveDefaultPet` uses `isAdoptable` and drops the `allPets[0]` last resort; the
      controller's `availablePets`, one line below, had the same raw comparison and now matches.
- [x] `tests/integration/adoptionSubmissionGuards.test.ts` — 10 strict-persistence tests.
- [x] `tests/unit/adoption/resolveDefaultPet.test.ts` — 7 tests; the function had none before.
- [x] Mutation-tested: four independent reverts, each turning red exactly the tests that name it.
- [x] Updated the `PetGallery` comment that cited the deleted ledger entry as its open reason.
- [x] Ledger: decision entry, two new open entries, one lesson. The neighbouring fixture-fallback
      entry is deliberately left untouched — see Explicitly NOT done.
- [x] `/code-review high` on the whole diff. Five findings, each checked by probe and all upheld;
      two fixed in code, three filed. See Review.
- [x] `/code-review high` again on the fix commit, which is where this repo's last three defects
      were. Five more findings, all upheld: one fixed (`petBreed`), four filed.

## Review

**The brief's step 1 was insufficient as written, and that is the finding.** Swapping
`findServerPetById` for `findServerPetByIdAsync` does not by itself make the check read the
database. That reader falls through to the `pets.json` mirror after a *successful* query that
found no row, and the mirror matches ids case-insensitively where Postgres does not — so a posted
`PET-001` missed the database, matched fixture `pet-001` (Available, unarchived there), and the
application was accepted against an animal the database had archived. The exact-id guard is what
closes it, which is what `getPetById` already does. The brief named exact-id matching; what it did
not say is that without it the swap is close to cosmetic.

**A regression the fix would have introduced.** The pet lookup ran *above* the rate limits, which
was free while it scanned an in-memory array and is a Postgres round trip once it does not.
Swapping in place would have handed an anonymous POST one `findUnique` per request with no budget
in front of it. Moved behind both budgets and pinned by a test that exhausts the email budget and
asserts `findUnique` was never called. That test is the one that goes red if someone moves it back.

**Every test discriminates.** Each rejection case is arranged under `pet-001` — a real row in
`src/data/pets.json`, Available and unarchived there — because an `itest-` id is absent from the
mirror too, so the assertions would pass against the broken action for the wrong reason. Proven by
probe rather than asserted: restoring `origin/master`'s action turns 6 of 10 red; disabling only
the status check turns exactly the 3 status tests red; removing only the exact-id match turns
exactly the case-variant test red; moving the lookup back above the budgets turns exactly the
rate-limit test red; restoring `|| allPets[0]` turns 3 of the 7 unit tests red.

**The suites are flaky under load, and it cost time here.** Seven other sessions were running in
this repo concurrently. Single runs of `--project unit` reported 63, then 72, then 12 failures
across *different* unrelated files each time, then 1587/1587 green on an unchanged tree; the
components tier failed two files with `Hook timed out in 10000ms` inside the `nextMocks.ts`
`beforeEach`. `vitest.config.mts` raises `testTimeout` to 20s but never sets `hookTimeout`, so
setup hooks keep the 10s default. Nothing here was a real failure — every file passed in isolation
— but the first instinct was to suspect this diff. A parallel session has filed the run counts;
not duplicated here. Rule of thumb: one failure each across unrelated files means load, not you.

**The review found the defects in what gets *written*, not in the check.** The guard itself held up.
Five findings, each verified by probe before being accepted:

- **The record stored the request's `petId`, untrimmed, while the guard compared the trimmed
  copy.** `applicationFormSchema` is `z.string().min(1)` with no `.trim()`, and the column carries
  a foreign key to `Pet.id`. A posted `" pet-001 "` passed every new check, then hit P2003 on
  insert — which `handlePersistenceError(…, "write")` swallows outside strict mode. The row never
  reached the database, lived in the mirror until the next restart, and the applicant got
  `success: true` and a reference code. Pre-existing, but the trim I added made it reachable
  through a guard that had just declared the animal valid. Fixed: write `pet.id`.
- **The record stored the request's `petName` too** — and I had filed that as "low severity",
  which was wrong. `atomicUpdateApplicationStatus` auto-rejects other open applications matching
  on `petName` *as well as* `petId`, and `markCachedPetAdopted` marks the first pet matching
  **either** id or name. So a submission naming a popular animal it was not for could close that
  animal's real applications on approval and flip the wrong pet to Adopted. Fixed: write
  `pet.name`; the open entry I had filed is deleted as settled. This is the finding that would
  have stopped the merge — it changed what my own ledger entry claimed.
- **My `availablePets` comment was false.** It claimed the list the form offers and the animal it
  opens on cannot disagree; the list has no consumer at all, and the wizard's `<select>` renders
  `allPets`. Comment corrected to say so rather than deleting the variable — this is the file where
  calling something dead cost a real defect once already.
- **Two form gaps** — `/adopt?petId=` preselects any public animal with no status filter, and a
  null `defaultPet` leaves the field empty while the select still lists every animal. Both filed.

Both code fixes are pinned by new tests that were mutation-checked: reverting `pet.id` and
`pet.name` turns exactly those two red and nothing else.

**The second review paid for itself, which is the whole argument for reviewing fix commits.** It
found five more, none of them in the guard:

- **`petBreed` was never written at all** — not by this change, by anything. The column's schema
  comment calls it a snapshot with "the same rationale as petName", existing so the record survives
  `petId` going null under `onDelete: SetNull`; the tracking portal's `pet?.breed || app.petBreed`
  was carried entirely by re-reading the live animal, so it showed nothing once that animal was
  gone — precisely the case the column is for. Fixed and mutation-checked. Same class as the first
  review's two findings: I had fixed the fields it named and not asked what else the draft owed the
  verified row.
- **The silent-success shape is worse than "a fixture animal can be applied for."** When the mirror
  answers, the application is written against an id the `Pet` table does not hold, the insert raises
  P2003, `insertServerApplication` swallows it, and the applicant gets `success: true` and a
  reference code for a row that reached no database. Disclosed at the guard and filed as
  `tasks/open/an-application-can-succeed-against-no-database-row.md`, with the observation that
  treating P2003 like P2002 is probably the smaller fix.
- **A public POST can now reorder the pet mirror**, because the reader rewrites it before any check
  runs, and `markCachedPetAdopted` takes the first entry matching *either* id or name. Two animals
  sharing a name and an approval can flip the wrong one. Filed rather than fixed: the repair is in
  `petRepository.ts`, which a parallel session was editing at the time.
- **The guard duplicates `getPetById`** — and so did my comment, three paragraphs of it. The
  comment now points at that one instead of restating it, so the two copies cannot drift into
  disagreeing explanations. Left as two copies deliberately; `AGENTS.md` says wait for a third.
- **The client store keeps what it posted** while the server records what it verified. Folded into
  the form entry.

**Merging #89 silently uncovered this branch's exact-id guard, and the probe caught it.** That PR
made `findServerPetByIdAsync` return `null` after a successful empty read. The case-variant test
here arranges `findUnique` to miss, so after the merge it is refused by `!pet` and never reaches
`pet.id !== requestedPetId` at all — **deleting the comparison left all 83 integration tests
green.** The guard was one cleanup away from being deleted as dead with a green build behind it.

The comparison is still load-bearing, on a narrower route: where no database is configured, or a
read threw and was swallowed, the mirror answers and its lookup lowercases while Postgres does not,
so `PET-001` resolves to fixture `pet-001`. Two tests now reach it that way (`STRICT_PERSISTENCE`
stubbed off so `isDatabasePersistent()` is false), one refusing the case-variant and one confirming
the exact id still works — the positive control, so a reader that refused *everything* on that
route could not pass. Re-probed after: deleting the comparison now fails exactly one test.

No lesson written for this: the parallel session had already filed
`tasks/lessons/2026-09-22-a-fix-can-silently-retire-the-test-that-guarded-the-thing-it-did-not-fix.md`,
whose rule is the one followed here, and a second copy is the duplication `AGENTS.md` warns about.

**The third review found the status check's floor, and it is lower than the code claimed.** The
guard's comment said an unrecognised status "resolves to the `pending` presentation, so it fails
closed". That is true of `getPetStatusPresentation` and false of the path that reaches it:
`fromDbPetStatus` compares four exact, case-sensitive spellings and returns `"Available"` for
everything else, so nothing unknown ever arrives at the fallback from a database read. A column
holding `adopted` presents as Available, `isAdoptable` is true, and the guard passes the animal it
exists to refuse — on a production branch that has held `Pet.status` as text rather than the enum.

Comment corrected, gap filed as `tasks/open/an-unknown-pet-status-reads-as-available.md`, and
pinned by a test named "does NOT yet refuse…" so it is found when the mapper is fixed rather than
discovered again. Not fixed here: the default sits in a mapper every pet read goes through, so
changing it is a catalogue-wide behaviour change, and what it should become is a real question —
`Pending` fails closed for adoption but files the animal in the adoptable track, throwing turns one
bad row into a failed render, and a fifth `Unknown` status touches every surface.

This is the one finding across three reviews that reached the PR's own claim. It does not defeat it
— before this change *no* status was checked at all — but "rejects a pet that is not adoptable" is
now stated with its floor: as far as the mapper can tell one.

**Rejecting `Pending` is a product call, and it was already made.**
`tasks/decisions/2026-09-10-pending-is-a-stage-of-adoption-not-a-track.md` files Pending in the
adoptable *track* while the detail page renders its button disabled on purpose. `isAdoptable` is
true for `Available` alone, so the server now agrees with the button rather than deciding anew.

## Explicitly NOT done

- **The repository-level fallback fix.** `findServerPetByIdAsync` still serves the fixture for an
  id a populated database lacks, so a `pets.json` animal can still be applied for. That residual
  is stated in a comment at the guard. Not fixed here because it changes every caller at once,
  including `src/actions/sponsorships.ts` — a public write path with no covering test — inside a
  change whose claim is about adoption. A parallel session is landing exactly that fix
  (`worktree-pet-missing-row-is-an-answer`, `97df591`), which also *closes* that ledger entry by
  deleting it. The two branches were merged locally and verified together at that commit:
  typecheck clean, unit 1589, integration 79 (this branch's 10, theirs, and the existing 59). That
  branch has since moved past `97df591`, so the measurement is pinned to the commit it was taken
  against rather than to a moving tip. A note recording "third guarded caller" was drafted onto that entry and
  then withdrawn — modifying a file the other branch deletes is a modify/delete conflict, and a
  conflicted PR gets no CI run at all. The relationship is recorded in the decision entry instead.
  The remaining collision is `tasks/todo.md`, which both branches prepend to; that is the known
  defect named in this file's own header, and whoever lands second resolves it.
- **The form's stale `petId`.** Dropping `allPets[0]` makes `null` reachable in one more case, and
  the form only syncs its fields when handed a real pet, so a reopen inside the close animation can
  still carry the previous animal's id. The dangerous half is closed — the server refuses it — and
  the confusing half is `tasks/open/adoption-form-keeps-a-stale-pet-id-when-it-opens-on-nobody.md`.
  Not fixed blind: both obvious repairs discard a half-filled form or submit for an unchosen
  animal, and no test covers that path.
- **`lookupApplicationStatusAction`'s mirror read** at the same file's line 505. Read-only display
  enrichment that already falls back to the application's stored `petBreed`; a mirror hit costs a
  stale breed and photo, not a wrong write.
- **Narrowing the form's pet `<select>` to adoptable animals.** The server refuses them now, but
  the wizard still renders `allPets`, so the refusal lands after four steps rather than at the
  point of choice. Not one line: the control must still hold whatever `selectedPet` put in the
  field, and `/adopt?petId=` puts a non-adoptable animal there on purpose. Filed with the two
  related form gaps as
  `tasks/open/the-adoption-form-offers-animals-the-server-will-refuse.md`.
- **The outage half of the fixture fallback.** The guard reads the database whenever the database
  answers. When the query *throws*, `handlePersistenceError` swallows it outside strict mode and
  the mirror answers under the posted id, so an outage still accepts applications against fixture
  animals at fixture status. That fallback is required by
  `tasks/lessons/2026-09-04-a-dual-layer-fallback-must-never-let-a-swallowed-database-error-fail.md`,
  so it is a policy question rather than a bug here. The first draft of the decision entry claimed
  `97df591` closed "the residual"; it closes the missing-row half only, and the entry now says so.
- **`selectedPet` is still returned without a status check.** Opening the form from an animal's own
  page should headline that animal; the server is the boundary that refuses the submission.
- **No component test for the `defaultPet === null` render.** The dialog title already branched on
  it and `allPets` is empty on a cold `/adopt` render, so the state was reachable before this
  change; the new behaviour is covered at the unit level instead.
# A pet the database lacks stops being served from the fixture

**Branch:** `worktree-pet-missing-row-is-an-answer` · opened 2026-09-22 · ROUTINE lane
**Closes:** `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md`

## Items

- [x] Audit the brief against `origin/master` 8d36ace before writing anything. Four of its five
      steps needed revising; step 3 was already satisfied and step 4's test shape would not have
      discriminated.
- [x] `findServerPetByIdAsync` returns `null` after a successful read that found nothing. One
      line; the `catch` and the no-database path are untouched.
- [x] `tests/integration/petMissingRowIsAnAnswer.test.ts`, 10 tests, every one on `pet-001`.
- [x] Probe: pre-fix reader put back, suite run, 3 failures observed, fix restored.
- [x] Three stale comments repaired — `prismaDouble.ts`, `faqEmptyPublishSet.test.ts`,
      `pets.ts` — all describing a `length > 0` trigger that no reader has used for weeks.
- [x] Ledger: decision entry; `pets-json-fallback-empty-means-outage.md` narrowed to the two
      readers that remain; one lesson.
- [x] Collision check against the nine live worktrees. `worktree-adoption-submit-guards` is
      closing `submit-application-checks-a-fixture-and-no-status.md` right now; a note written
      there was reverted rather than shipped into a modify/delete conflict.
- [x] Gates: `typecheck`, `test:integration` (70), `test:components` (170), `lint` (0 errors),
      `docs:check`. `npm test` is reported separately — see Review. CI is the authority for the
      two that cannot run here: `Strict persistence against Postgres` and `Playwright golden
      paths` both passed on PR #89.
- [x] `/code-review high` on `origin/master...HEAD`: 4 findings, all verified by probe, 3 fixed
      in `06393d3` and the fourth refiled as an open entry. Second review round on that fix
      commit, per the standing order that a fix round is unreviewed code.
- [x] Merged `origin/master` after #88 landed mid-session. The merge-check was clean, and the
      clean result was not taken as the answer: `tasks/todo.md` is the one file both sides
      touched, and it was read afterwards to confirm neither stream was dropped — `git diff
      origin/master -- tasks/todo.md` shows no removed lines, so this copy is a superset of
      theirs. #88 touches no `prisma/` path, so no `db:generate` was needed before re-running
      the gates.

## Review

The brief asked for five things and four of them were wrong about the repository, which is the
part worth recording.

**Step 3 — "verify callers return 404/error" — was already true.** `getPetById` has returned
`null` on a falsy pet since PR #38 and `createPetSponsorshipAction` has returned
`{success: false}` since it was written. Neither was edited. Editing them would also have
collided with `codex/sponsorship-contract`, an unmerged branch that rewrites
`src/actions/sponsorships.ts` wholesale — worth checking for before touching a file, not after.

**Step 4's suggested test would not have failed against the bug.** The brief pointed at
`softDeleteFiltering.test.ts`, whose own comments already document why: an `itest-` id is absent
from the fixture mirror too, so the reader returns `null` for it either way. Every test in the
new suite uses `pet-001`, a real row in `src/data/pets.json`, unarchived there.

**The decision was not actually open.** Both the open entry and `prismaDouble.ts` described
`getServerPetsAsync` as gating its fallback on `rows.length > 0`; it has not done that since it
was fixed, and `softDeleteFiltering.test.ts` pins the current behaviour. So the catalogue and the
profile disagreed about the same table, and the profile was the odd one out — which turns "should
a missing row fall back?" from a policy question into a consistency defect. That is the whole
argument for the one-line change, and it was sitting in the repository rather than in the brief.

**Deliberately not done:**

- **`src/actions/sponsorships.ts` untouched.** A genuinely unknown `petId` now gets
  `SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE` — "we could not confirm your pledge" — which invites
  a retry that can never succeed. It is the wrong message for the case, but it is the right
  *outcome*, the file is being rewritten on another branch, and a copy change is not this task.
- **`submitApplication` untouched, and its open entry left alone.** Another session is closing
  both on `worktree-adoption-submit-guards`, off the same base commit. The two changes compose —
  their caller switch plus this reader fix — but neither is complete alone: on their branch a
  fixture id still resolves, because they inherit the pre-fix reader. The paths are disjoint, so
  the merge will be clean and will prove nothing; whoever lands second runs the other's suite.
- **The mirror is still rewritten on every public profile view**, so during an outage the
  catalogue's order follows recent profile views. Carried into the decision entry rather than
  fixed: it is cosmetic, and the sync is what lets a later outage serve a recently viewed animal.
- **Tier 3b (`npm run test:db`) not run** — no Postgres on 5432 here, and
  `tests/integration/db/` has no pet-read coverage, so it could not have exercised this.
- **`npm run build` not run.** The worktree has its own `npm ci`, so it could have been; it was
  left out because nothing here touches a route, a component or the Prisma schema, and the build
  would only re-prove what `tsc --noEmit` already proved. Named rather than implied.
- **The unit suite was not made to pass, because it does not pass on `master` either.** Five runs
  in ninety minutes: `1580 passed (1580)`, then `57 failed` on the same tree, then `54 failed`
  on the main checkout carrying **none** of this branch's changes, then `1819` green across all
  three projects from a review sub-agent, then `8 failed` after the merge — on a set of files
  *disjoint* from the earlier failures, one test in each of eight unrelated domains.

  Two measurements pin it as order-dependence rather than breakage, and they point opposite
  ways: the eight files from the last run pass when run together alone (`8 passed`, `156
  passed`), and `tests/unit/volunteerForm.test.ts` fails when run alone (`4 failed | 10
  passed`) on both trees while passing inside the full suite. One group needs the suite, the
  other needs to avoid it.

  Filed as `tasks/open/unit-suite-is-order-dependent-in-both-directions.md` with all five counts
  and both repros. Not fixed here: it is not this change's defect and it is its own task. The
  claim this branch can actually make is the narrow one — every deterministic gate passes, the
  new suite passes in every run it appeared in, and the gate that is not deterministic is
  reported as such rather than as a pass.

## Review round

`/code-review high` found four, none touching the fix. Each was checked by probe before being
accepted, per the standing order:

1. **Sponsorship checkout accepts an archived animal** — confirmed by `grep -n "isArchived"
   src/actions/sponsorships.ts`, which returns nothing. The settled entry had recorded this and
   the decision entry replacing it had not carried it, so it would have left the ledger with the
   file. Refiled to `open/`, where it mirrors to a public issue. Not fixed: it is a caller check,
   and the caller is being rewritten on `codex/sponsorship-contract`.
2. **The `getPetById` comment understated its own guard**, saying the exact-id check covers "the
   no-database path" when the `catch` path reaches the same case-insensitive mirror. Fixed — and
   pointed at, because this branch's lesson is precisely that comments become the spec.
3. **`not.toHaveBeenCalled()` depended on test declaration order** — the ledger `vi.fn()` is
   built once in the module factory and no config clears it. Fixed with `vi.clearAllMocks()`.
4. **`@/lib/email` was mocked wholesale**, leaving twelve of fourteen exports undefined for the
   next test that needs one. Fixed with `importOriginal` and a spread.

The reviewer also ran the probe independently and reproduced the same three failures, which is
the part of its report worth more than the findings.

### Second round, on the fix commit — and it was right to insist

The standing order says a fix round is unreviewed code. It found five more, and this is the part
of the stream worth reading:

1. **The exposure is still open on the outage path.** `handlePersistenceError` rethrows only
   under `STRICT_PERSISTENCE`, which nothing outside `vitest.config.mts` and one npm script sets
   — so in production a transient read failure serves fixture `pet-001` at its exact URL and
   bills a pledge against it. The decision entry had filed this under "what this deliberately
   stops serving", as a *virtue*, and not under "not closed by this". The code was right and the
   claim was wrong, which is the more dangerous of the two. Filed as
   `tasks/open/an-outage-serves-and-bills-fixture-animals.md`; framing corrected in place.
2. **Three comments I had just written were factually wrong about other functions** —
   "the same trigger `getServerPetsAsync` uses" (it has no `isDatabasePersistent()` gate at all),
   "all three fall back only from their `catch`" (contradicted by a test in the same commit), and
   the exact-id guard "covers" both mirror routes (it refuses a case-variant and nothing more).
   This stream's own lesson is about exactly this, and I reintroduced it within the hour. The
   lesson now says so and carries a stronger rule: a comment naming another symbol is a claim
   that requires opening that symbol, not recalling it.
3. **A test pinned the repair shut.** "Leaves the mirror holding the fixture it declined to
   serve" also asserted that the reader may never evict the denied id — which is the cheapest fix
   for finding 1. It now asserts a *different* fixture id survives, proving the suite has not
   simply lost its fixtures without forbidding the improvement.
4. The wrong checkout message is **newly reachable because of this change**: `if (!pet)` was
   nearly dead before, and is now the normal answer for a hard-deleted animal, telling supporters
   to chase a bank reference for a pledge nothing attempted. Recorded on the sponsorship entry.

The probe was re-run after the test edit — same 3 of 10 fail against the pre-fix reader — because
changing an assertion invalidates the earlier discrimination evidence.

### Third round, before the merge — and it stopped the merge

Run against the whole diff once the PR was open. Five findings; one of them was the reason this
list insists on a review per fix round.

**The change had silently retired the test guarding `getPetById`'s exact-id check.** That guard
was pinned by `softDeleteFiltering.test.ts`'s case-variant test, which arranges `findUnique` to
resolve `null` for `PET-001`. Against the old reader that null reached the case-insensitive
mirror and the guard refused the result; against the new reader the empty read returns `null`
first and the guard is never reached. Measured, not argued: deleting `pet.id !== requested` left
**69 of 69 integration tests green**. Two earlier reviews missed it, and so did I — the line is
still executed, just never decisive, so nothing flags it. A comment in the same commit said "do
not delete this guard", which is a note, not a test.

Closed by a new test that reaches the guard the way production still can — no `DATABASE_URL`, and
a non-strict outage — with a positive control asserting `/pets/pet-001` *does* resolve on the same
route, so a reader that refused everything could not pass it either. Verified by probe: removing
the guard now fails that test, where before it failed nothing. Integration is 70, not 69, for
this reason. Lesson written:
`tasks/lessons/2026-09-22-a-fix-can-silently-retire-the-test-that-guarded-the-thing-it-did-not-fix.md`.

The other four were narrower and all confirmed: a test of mine whose comment claimed coverage it
did not provide (`resetServerStore()` reseeds the array it asserts on, so it holds even against a
reader with no fallback); a `prismaDouble.ts` comment saying the no-database door is unreachable
under that double when this branch's own test walks through it; a docstring naming one place
`STRICT_PERSISTENCE` is set where the branch's own ledger entry names two; and the checkout
rejection being pinned only as `success: false`, which locks in a message that tells supporters to
chase a bank reference for an animal that never existed. The first three are fixed. The last is
recorded on the sponsorship entry rather than fixed, because that file is being rewritten
elsewhere.

Three of the five were, again, prose asserting something about code — the failure this stream
already wrote a lesson about, found twice more after writing it.

# Sponsor portal production activation — audit, run, close

**Branch:** `worktree-sponsor-portal-production-activation` · opened 2026-09-16 · GRAVE lane
**Brief:** `docs/tasks/TARGET_SPONSOR_PORTAL_PRODUCTION_ACTIVATION.md`

## Items

- [x] Audit the brief against `origin/master` 5b2672a: #39's columns, 5b2672a's checkout, the
      local-rehearsal lesson, #41.
- [x] Claim and six kill conditions committed before the production read (`3c14176`).
- [x] Step 1: `npm run db:check-drift` from the main checkout, read-only. Every planned object is
      already present, so the apply list is empty. K1 did not fire; K2–K6 n/a.
- [x] Step 5, GET-only: `/sponsors` and `/sponsor/login` return 200. That proves less than first
      claimed; see Review.
- [x] Revise the brief; resolve §2 of the sponsor portal entry; re-measure note on the drift entry;
      decision entry with the raw output.
- [x] §A, answered by the human in Vercel: Production `DATABASE_URL` names `ep-broad-band-…`.
- [x] Trigger probe, run by the human (agents are refused production reads): no append-only
      trigger, 3 receipts, 0 pledges. Closed by
      `tasks/decisions/2026-09-21-production-receipts-are-append-only.md`.
- [ ] Step 6, the end-to-end receipt test: human decision. No real pledge exists, so it needs a
      staff sponsorship with a real transfer.
- [x] Decide the 3 receipts. Owner's query, 2026-09-18: all three are e2e test rows. Delete
      them and keep the counter at 3 (`tasks/decisions/2026-09-18-e2e-test-receipts-removed-counter-kept.md`).
      `cleanup.sql` rehearsed on local PostgreSQL: the production case plus five abort cases.
- [x] Owner applied `cleanup.sql`, then `donation_append_only.sql`, 2026-09-21. Verified: the
      ledger is empty, the counter reads 3, and `donations_no_mutation` is enabled.
- [x] PR #47's enum migration: applied by the owner, and confirmed by `db:check-drift` on
      2026-09-18 (3→2 destructive, 6→1 additive).
- [x] PR #47: merged by the owner 2026-09-18. An agent merge was refused as
      `[Merge Without Review]`, and the PR was a draft at the time.

## Explicitly NOT done

- **No production write of any kind.** Nothing was missing, and the trigger is a separate decision.
- **No local rehearsal.** The apply list was empty. The `db pull --print` route stays a candidate
  in the brief, unexercised.
- **`neon-certificate-chain-not-observed.md` left alone.** PR #47 moves it to `decisions/`. This
  session's evidence was first overclaimed, then reverted.
- **No lesson file.** The patterns (a public GET cannot show production has a database; agents
  cannot read production; K2 needs keyword and classifier) are in the brief and the decision
  entry. None came from a human correcting this session's work, which `tasks/lessons/README.md`
  requires.
- **No PR.** The branch is docs and ledger only, and `AGENTS.md` forbids a docs-only PR. It rides
  the next code branch.

## Review

- **Independent review earned its keep twice.** Round one found 8 defects in this session's own
  writing: a K2 claim the classifier does not support, a dropped production-target warning, a
  false brief-author timeline, and "receipts real since 5b2672a". Round two found the serious one.
  `/sponsors` rendering no demo names does not show a database: `SEEDING_ENABLED` is off under
  `NODE_ENV=production`, so a production build with no database renders the same page. Only the
  Vercel dashboard could answer it, and it did.
- **The two commits recording the Vercel answer and the probe results were not independently
  reviewed.** They record human-reported facts only. Whoever opens the PR this rides on runs
  `/code-review` over the whole diff.
- **Related live incident, not this stream's:** PR #47 documents that production lacks the
  `ApplicationStatus`/`PetStatus` types, so application inserts and status writes fail silently.
  Its ledger hedged on which database Vercel uses; §A answered that: this one.
- **Supersedes an item in the stream below.** It lists "decide how to correct the three 2026-09-14
  test receipts (offsetting record)" as open. They were removed instead, with the counter kept, on
  2026-09-18 and 2026-09-21: `tasks/decisions/2026-09-18-e2e-test-receipts-removed-counter-kept.md`
  and `tasks/decisions/2026-09-21-production-receipts-are-append-only.md`. An offsetting record
  would have added two false documents to remove one, and no code path issues one.

# Public staff credentials and production data safety — PRs #46 and #47

**Branches:** `fix/refuse-published-staff-passwords` (#46), `fix/local-e2e-off-remote-databases` (#47)
· opened 2026-09-16 · #47 merged 2026-09-18 (squash `561ec62`), #46 merged 2026-09-21 (merge commit
`a6d1007`) · follow-ups #72 (`9a50c8c`) and #73 (`a8847d5`) merged 2026-09-21

- [x] #46: `loginAction` refuses repo-published staff passwords in production; register and invite
      acceptance refuse them everywhere; `/admin/login` drops the pre-fill and, in production, the
      demo block. Proven on an offline `next build` + `next start`.
- [x] #46: `docs/runbooks/RUNBOOK_PRODUCTION_STAFF_ACCOUNT_LOCKDOWN.md` — create a real Super Admin
      without email, then suspend the seeded accounts; SQL rehearsed locally, 16 checks.
- [x] #47: local e2e cannot reach a non-local database or send mail; `seed.ts` and `migrate-faqs.ts`
      use `resolveDatabaseSsl`; Neon TLS entry closed.
- [x] #47: `prisma/migrations/manual/20260917_status_enums/` — rehearsed locally, 29 checks.
- [x] #72: `fix/admin-actions-honour-suspension` — transparency & FAQ actions check staff suspension;
      settled `tasks/decisions/2026-09-18-content-actions-honour-suspension.md`.
- [x] #73: `fix/email-audit-entities` — audit log rows record the concrete entity rather than generic
      application; settled `tasks/decisions/2026-09-18-every-email-names-its-audit-entity.md`.
- [x] Owner: runbook §4 or §5 in production, then merge #46 (merged 2026-09-21; the production
      steps are the owner's report, not observable from here).
- [ ] Owner: apply the enum migration in the Neon SQL editor (needs no merge).
- [ ] Owner: decide on `SESSION_SECRET` rotation, now that the cookie-only actions are known.
- [ ] Owner: decide how to correct the three 2026-09-14 test receipts (offsetting record).

## Review

**Done without production access.** The owner asked on 2026-09-17 for the production steps to be
done for them. The auto-mode classifier refused even a read-only query against production, and
refused `prisma db push` / `migrate diff` against a local throwaway database. So everything that
touches production is prepared, rehearsed on an embedded PostgreSQL shaped like production, and
handed to the owner; nothing has run there.

**Four review rounds, each on the previous round's fixes, each found something real:** an
unqualified enum type that would convert the columns yet leave Prisma failing (confirmed against
the old file); a lock timeout that did nothing when an editor runs one statement per transaction
(the old file was still waiting at 20 s); a hash command that would have created an unusable Super
Admin from a published password; and suspension not reaching the transparency and FAQ actions,
which authorize from the cookie alone.

**Deliberately not done:**
- Fixing those cookie-only actions in #46 itself. Done instead as its own PR stacked on #46
  (`fix/admin-actions-honour-suspension`, 2026-09-18), after the owner had run their steps:
  `tasks/decisions/2026-09-18-content-actions-honour-suspension.md`.
- `pets.age` → `birthDate`, the other half of the schema drift: needs a backfill decision, and
  PR #42 is in flight in that area.
- The email audit rows filed under `AdoptionApplication`: `tasks/open/email-audit-rows-name-the-wrong-entity.md`,
  on master since #47. Fixed afterwards in #73.
- Merging any of these PRs: not permitted to this session, so each merge is the owner's. After
  #46 merged, this branch took master and retargeted to it — the procedure differs for a squash,
  which is what #73 needed.

# Dual-track pet catalogue — plan

**Branch:** `worktree-agent-4-animals` · opened 2026-09-08

## The finding that shaped this

`buildPetStatusFilterOptions` (`src/lib/presentation/petStatusPresentation.ts`) already exists,
is tested, and says in its own docstring that filter controls should derive their options from it
"rather than hand-listing them, which is how rehabilitation was omitted from the admin table's
status filter in the first place."

Only `usePetTableController` (admin) obeys it. The public `PetGallery` hand-lists three of the four
statuses and omits `Adopted` — the same defect, live, in the public catalogue. So this task is not
"build a catalogue"; it is **finish the abstraction the repo already built** and hang the track
split off it.

## Decisions

- **Pending belongs to the Adoptable track.** It is a stage of the adoption pipeline, not a third
  state. `PetDetailView` already renders it as "Adoption Pending" on the adopt button, so this
  makes the catalogue agree with the page it links to.
- **Adopted is its own track, not a hidden status.** Today an adopted animal appears under "All"
  with a *disabled* button labelled "Adopted" — the dead button `PetCard`'s own comment says it
  wanted to avoid. A track with no CTA removes it.
- **Tabs are derived from the population**, so a track with no animals renders no tab. Same
  contract `buildPetStatusFilterOptions` already keeps for counts.
- **Adopt stays a modal.** No `/adopt` route; `AdoptionForm` is unchanged.

## Items

- [x] 1. `petStatusPresentation.ts` — add `track` to the existing presentation record; derive
      `buildPetTrackOptions` / `matchesTrackFilter` from it. One field per status, no new module.
- [x] 2. `usePetGalleryController.ts` — collapse five copy-pasted filter slots into one declared
      spec, then add `gender` and `track` as data rather than as two more copies.
- [x] 3. `PetGallery.tsx` — track tab strip + gender select; status select stops hand-listing.
- [x] 4. `validations/pet.ts` + `actions/pets.ts` — `gender` filter.
- [x] 5. `actions/pets.ts` + `pets/[id]/page.tsx` — archived animals stop rendering publicly.
- [x] 6. `PetCard.tsx` — no CTA on the alumni track.
- [x] 7. `translations.ts` — track + gender labels, en and ms.
- [x] 8. `tests/unit/pets/petCatalog.test.ts`.

## Explicitly NOT done

- `src/lib/domain/petProfiles.ts` — **not created.** Its stated contents (progress, status badge)
  already live in `petStatusPresentation.ts`. Creating it would be the duplication AGENTS.md names
  as this repo's top defect shape.
- ISR / `revalidateTag` — blocked on `tasks/open/pets-json-fallback-empty-means-outage.md`. Tagging
  a reader that serves fixtures on a zero-row count caches the ambiguity.
- The `/pets/[id]` detail page — already built (751 lines: tabs, rescue story, compatibility,
  status badge, rehab progress bar, medical timeline, updates feed, both CTAs).

## Review

All eight items done. The shape that fell out: **one field on one record decides everything.**
`PetStatusPresentation.track` is the only place a status is assigned to a section; the tab strip,
its counts, the status options inside it, and the card's CTA all derive from it. Adding a status
means adding a `track:` line — no component changes. `tests/unit/pets/petCatalog.test.ts` pins
that as a property ("gives every declared status a track in the declared sequence") rather than
leaving it as a claim in a comment.

Two things found on the way that were not in the brief:

1. **`/pets/[id]` served archived animals.** `getPublicPets` has filtered them since it was
   written; `getPetById`, the reader behind the profile page, never did. Archiving took an animal
   out of the grid and left its page reachable by direct link. Fixed at the action, not the
   repository — `findServerPetById` stays unfiltered because the update and archive mutations
   read with it and must see the row they are about to write.
2. **The server-action auth guard passes some functions on their neighbour's authorization.**
   `getPetById` was reading as guarded because the extractor slices a body from one exported
   function to the next, swallowing the private `getAdminActorOrThrow` helper that follows it.
   Reproduced (1499-char body, contains `verifyAdminSession`), written up in
   `tasks/open/server-action-auth-guard-slices-bodies-by-the-next-export.md`, and `getPetById` is
   now listed explicitly instead of classified by adjacency. The extractor itself is unchanged —
   that is a change to a security guard and belongs in its own task.

One deliberate corner: `/pets` sends the whole public population in a single payload, because
the facet counts have to be computed over animals the visitor is *not* currently filtered to.
Marked with a `ceiling:` comment naming ~500 as the point to page it.

### Verification

| Check | Result |
|---|---|
| `npx vitest run --project unit tests/unit/pets/petCatalog.test.ts` | 22/22 pass |
| `npm run test` (full unit project) | 79 files, 1304/1304 pass |
| `npm run test:components` | 5 files, 58/58 pass |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 17 warnings, none in touched files |
| `npm run docs:check` | OK, every invariant reference resolves |
| `npm run arch:check` | no new orphans or cycles |
| `npm run build` | could not run at the time — **since resolved, see "The build gap, closed"** |

`npm run build` fails in this worktree with *"Could not find the Next.js package
(next/package.json)"*: the worktree has no `node_modules` of its own, and Turbopack will not
resolve outside its workspace root. Everything else resolves by walking up to the parent
checkout, which is why the suites run. **Remaining risk: no production build has exercised these
pages.** Typecheck and the component suite cover the module graph and the rendering, but not
prerendering. Run `npm run build` from the main checkout after merge.

That gap is also why `/pets` now declares `export const dynamic = "force-dynamic"`: dropping the
`searchParams` prop would otherwise have flipped it to static prerendering silently, in a place
where a build that cannot reach the database bakes the `pets.json` fixtures into the page.

## Code review round (`/code-review xhigh`, 2026-09-09)

Fifteen findings. **One of them said the headline claim above was wrong, and it was right.**

`getPetById` called `findServerPetById` — a synchronous lookup over the in-memory mirror, which a
cold process initialises from `src/data/pets.json`. So the archive guard was reading `isArchived`
off a fixture: an archive performed in another instance stayed invisible, and the profile page
kept serving the animal. The converse too — a pet that exists only in the database 404'd on any
instance that had not already loaded the catalogue. The action now reads `findServerPetByIdAsync`,
which is what `getServerPetsAsync` has always done for the catalogue beside it.

The unit test could not have caught it: it arranges and reads the same mirror. Four DB-backed
tests went into `tests/integration/softDeleteFiltering.test.ts`, and `prismaDouble` gained
`pet.findUnique`. **Each was confirmed to discriminate** by reverting the fix and watching them
go red — which exposed a second problem the review had not: the first archived-animal test used
an `itest-` id absent from the fixture mirror, so it passed against the *broken* reader for the
wrong reason. It now uses `pet-001`, a real fixture row, which is the production scenario.

Also fixed from the review: a status `<select>` that could hold a value with no matching option
(blank control, empty grid, invisible filter — now `buildVisibleStatusFilterOptions` keeps the
selection visible at zero); a track strip that vanished while a track was still selected;
`matchesTrackFilter` failing closed on a malformed `?track=`; a stale `sm:col-span-3`; a fourth
hand-written copy of Male/Female (now `GENDER_VALUES`); `signInAsAdmin()` in the public-read tests,
which would have masked an authorization gate on the very reads they cover; and a `PetCard`
comment that claimed there was no dead "Pending" button while the code renders one deliberately.

Two findings were declined, with reasons: the server-side `gender` filter has no production
caller, but neither do `species`/`size`/`ageCategory`/`status`/`search` since this branch removed
the only caller passing filters — deleting one field would leave the contract asymmetric. And the
auth guard's body-slicing defect stays whitelisted rather than patched, because changing a
security guard's extractor is its own change; it is written up in `tasks/open/`.

### The controller finding

The review's sharpest quality point: the 314-line rewrite had no test at any tier. It now has 41,
in `tests/components/usePetGalleryController.test.ts`. They were validated by mutation — 15
deliberate regressions to the hook made 20 of them fail, including the dropped-change
(`track=alumni&status=Pending`) that `updateFilters`' own comment predicts if it ever regresses to
per-key setters.

Writing them turned up two more real defects, both fixed:

- **Reset discarded foreign query parameters.** `router.replace(pathname)` threw away
  `utm_source` and anything else riding along, so the one control meaning "show me everything"
  detached the visit from the campaign that brought it — while every other filter interaction
  preserved them. `handleResetFilters` is now `updateFilters({ ...FILTER_DEFAULTS })`, which
  deletes exactly the keys the gallery owns. That is also shorter than what it replaced, and it
  removed the `syncUrl` branch this file's earlier review fix had just added.
- **`?search=%20%20` reported an active filter that narrowed nothing.** `hasActiveFilters` now
  compares the same trimmed value the matcher uses.

**Still not covered:** nothing exercises a re-render *after* a URL write — `router.replace` is a
spy that never feeds its href back to `useSearchParams`, so back/forward navigation and the
stale-snapshot hazard `updateFilters` guards against would need an E2E test.

### Verification, second round

`typecheck` clean · `test` 79 files / **1310** pass · `test:components` 6 files / **100** pass ·
`test:integration` 6 files / **56** pass · `lint` 0 errors (17 pre-existing warnings, none in
touched files) · `docs:check` OK.

## The build gap, closed (2026-09-10)

Reported twice as unrunnable. It runs; the worktree just needed its own dependencies —
`npm ci` (not `install`, so the lockfile is not rewritten), because vitest resolves by walking up
to the parent checkout and Turbopack refuses to compile outside its workspace root.

It then failed a second time, on `SESSION_SECRET is not set`: `.env.local` is gitignored, so a
worktree has no environment at all, and `next build` sets `NODE_ENV=production`, which flips
`resolveSecret` from warn to throw. Built with a throwaway `SESSION_SECRET`/`ADMIN_SECRET_KEY`
passed inline rather than by copying `.env.local` across — that file points `DATABASE_URL` at the
Neon **production** branch, and a build with no database is the more honest test anyway.

**`npm run build` passes.** The route table confirms the rendering-mode decision rather than
leaving it as reasoning:

    ├ ƒ /pets                    ← Dynamic, as `force-dynamic` intends
    ├   /pets/[id]
    │ ├ ● /pets/pet-001          ← SSG, 10 paths prerendered

With no `DATABASE_URL` the reads fell back to `pets.json` and prerendered ten fixture animals —
which is precisely the outage shape `force-dynamic` keeps off `/pets`. Nothing left unverified
except the URL round-trip noted in
`tasks/open/gallery-url-round-trip-is-never-exercised.md`.

## Merging master (2026-09-11)

Dry-running the merge before opening the PR found master 11 commits ahead and four conflicts. Two
things came out of it that the conflicts alone would not have shown:

- **This file.** On day one I wrote this plan with a full-file write and deleted the 499-line FAQ
  stream below it without reading it. Master had also edited the file, so it conflicted, and the
  stream is restored here in full beneath the header master added. Had master left this file
  alone, the deletion would have merged cleanly.
- **The lessons split was already on master** (PR #37, 2026-09-09) — same format, same content,
  different slugs on long titles. Git reported no conflict in `tasks/lessons/`, and 33 lessons
  would have landed twice. Diffing titles across both sides found them; all 33 were body-identical
  to master's copies and are removed. Master's split, README and decision record stand; this
  branch contributes only its four new lessons, plus five pointer updates master's split had
  missed, repointed at master's filenames.

`CLAUDE.md`'s close-out procedure now sits on master's version of the file (the drift-log rule it
cited moved to `AGENTS.md`, and gained a session-id filter). Step 5 now says to prepend to this
file and never rewrite it; the merge-check step now says to dry-run the merge and check for
overlapping work before opening a PR. Both are written from this round. Lesson:
`tasks/lessons/2026-09-11-a-clean-merge-says-nothing-about-duplicated-work.md`.

Re-verified on the merged tree: `typecheck` clean · `test:all` **95 files / 1555 pass** · `lint`
0 errors · `docs:check` OK · `build` passes, `/pets` still dynamic, `/pets/[id]` still SSG.

## Merging master again (2026-09-16)

PR #38 had gone `CONFLICTING` while it sat: master moved 20 commits, so it was getting no CI. One
textual conflict, in this file — and it was the restructuring kind. Master's `eaca046` moved every
historical stream out of `todo.md` into `tasks/archive/todo-historical-streams.md`. Keeping this
branch's copy would have put the 499-line FAQ stream back inline while it also sat in the archive.
Resolved by script onto master's layout, refusing if any stream below this one was absent from
the archive: all five were present, so this stream now sits under "Active Work Streams" and nothing
else is here.

Checked beside the conflict, since restructuring is where a clean path-level merge lies: master
touched `src/actions/pets.ts` (a comment path only; the async `getPetById` fix is intact), and moved
two docs this branch had edited into `docs/archives/tasks/` — rename detection carried the edits,
and no old path was resurrected. Master also reworked `SponsorshipModal` and the adoption and
sponsorship controllers, which `PetGallery` renders; they type-check against it unchanged.

`typecheck` first failed in `src/lib/server/applicationRepository.ts`, a file this branch never
opened, on a `referenceCode` field. Master had added it to the schema, and the worktree's generated
client predated the merge. `npm run db:generate` cleared it with no code change. Written up as
`tasks/lessons/2026-09-16-after-a-merge-a-type-error-in-a-file-you-never-touched-is-a-stale-client.md`,
and the merge-check step of `CLAUDE.md`'s close ("Merge-check against current `origin/master`")
now says to regenerate after a merge that touched `prisma/`. Cited by name, not number: a step was
inserted above it on 2026-09-16 and the number this line first gave pointed at the wrong one.

Re-verified on the merged tree: `typecheck` clean · `test:all` **104 files / 1688 pass** · `lint`
0 errors · `docs:check` OK · `build` passes, `/pets` still dynamic, `/pets/[id]` still SSG.

## Second code review (`/code-review xhigh 38`, 2026-09-16)

Asked for by the user before merging, and they were right to ask: the commit that fixed the first
review's fifteen findings had never been reviewed itself. Fourteen candidates, each checked
against the code before acting. **Eleven real, three pre-existing.**

**The one that stopped the merge.** The archived-profile fix could be bypassed by changing the case
of the URL. `findServerPetByIdAsync` falls back to the in-memory mirror not only when the database
fails but also when it *succeeds* with no row, and the mirror matches ids case-insensitively where
Postgres does not. `/pets/PET-001` missed the database, found fixture `pet-001` unarchived, and
served it. `getPetById` now requires an exact id match. And the test named "returns null when the
row does not exist" used an id absent from the mirror too — passing for the wrong reason, the exact
shape of this branch's own lesson from six days earlier. Renamed to say what it covers; the real
case is a new test against fixture `pet-001`.

Fixed. **Not every one has a test** — this line first said "each with a test shown to go red
when its fix is reverted", and the review of this round caught that three did not. Proven red on
revert: the case-variant guard, `buildVisibleTrackOptions`, `resolveFilters` (status, track and
base filters separately), the track-switch status rule, `syncUrl: false` ignoring the URL, search
written as typed, and the server search trim. **Untested:** the Adoption Form preselect (it lives
in `PetGallery`'s markup, and no suite renders the gallery), and the `React.cache` wrapper
(nothing observes a second query that does not happen). The gender label gained a test in the
round below.

- The gallery's "Adoption Form" button preselected `filteredPets[0]`, which the new Adopted and
  Rehabilitation tabs make non-adoptable by construction. It now passes the first adoptable animal
  or `null`, and `resolveDefaultPet`'s existing fallback picks the rest. *(Corrected in the round
  below: `null` does not guarantee an adoptable animal.)*
- A selected track vanished from the strip when other filters emptied it — the defect
  `buildVisibleStatusFilterOptions` was added to fix for status, left open for tracks.
  `buildVisibleTrackOptions` now does the same.
- Filter values from the URL are resolved once, in `resolveFilters`, against `petFilterSchema` and
  `PET_TRACK_SEQUENCE`: an unrecognised value means "not filtering", never "match nothing", and a
  legacy `?status=Rehabilitation` resolves to the canonical option the select actually has. That
  one change closed three findings, which had each described a different symptom of raw values.
- Switching track kept the status only when switching to a track that did not contain it; it now
  keeps it for "All" and for the status's own track.
- The home page's featured strip seeded filters from the URL with no controls to show them.
  `syncUrl: false` now means the URL plays no part in either direction.
- Search was trimmed before being written to a URL the box reads back from, so a space could not be
  typed. Pre-existing, but this branch's own test had pinned it; now written as typed, compared
  trimmed.
- `getPetById` became a real query in this branch and was called twice per render.
  `React.cache` in the page, per the Next 16 docs on metadata.
- The server search did not trim where the client did; `GENDER_LABEL_KEYS`' docstring claimed a
  coverage it did not have.

**Deliberately not fixed here**, each written up with what would settle it:

- `submitApplication` — reading the code to write up the preselect finding showed it checks
  archiving against the fixture mirror, accepts an unknown pet id, and checks no status at all.
  Pre-existing, belongs to #39's adoption work, and a public write path deserves its own review.
  `tasks/open/submit-application-checks-a-fixture-and-no-status.md`.
- The repository still falls back to the fixture after a *successful* "no such row", so a
  fixture-only id is served at its exact URL. That is the open fallback-policy question, not this
  branch's to decide. `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md`.
- Every filter change is a server navigation on a dynamic page. Pre-existing and unmeasured.
  `tasks/open/gallery-filters-navigate-the-server-on-every-change.md`.

The process gap is recorded where it will fire: `CLAUDE.md`'s close now has a step to review the
whole diff — fix commits included — before opening or merging a PR. The lesson itself already
existed (`tasks/lessons/2026-09-08-a-security-fix-needs-an-adversarial-pass-of-its-own…`); it was
in `tasks/lessons/` and not in the list I follow at close, so it did not run.

## Third code review — of the uncommitted fix round (`/code-review xhigh`, 2026-09-16)

Run on the fix round *before* committing it, by the step added above. Fourteen candidates; **ten
real**, one of them a crash this round had introduced.

**The crash.** `PetCard` had switched from a ternary to `t(GENDER_LABEL_KEYS[pet.gender], …)`.
`gender` is a free-text column, only cast by the mapper, so any stored value other than exactly
`Male`/`Female` gave an `undefined` key — and `t()` calls `.split` on its key. One mistyped row
would have taken down the whole catalogue and the home page's featured strip. Replaced by
`genderLabelArgs`, total over any string; the three other places that label a sex (detail dialog,
detail page, donation carousel) now call it too, with identical output, so the four cannot
disagree. A render test reproduces the crash on revert:
`TypeError: Cannot read properties of undefined (reading 'split')`.

Also fixed, each shown red on revert:

- **The case-variant test arranged no archive.** It mocked `findUnique` to return `null` for every
  id, pinning "a variant URL 404s" rather than "an archive stays hidden". It now models Postgres —
  the archived row exists and is returned only for the exact id — and reads the variants *first*,
  because reading `pet-001` syncs the archived row into the mirror and would hide the bypass on its
  own.
- **`resolveFilters` made the filter schema load-bearing, and the schema hand-copied its enums.** A
  band added to `AGE_BANDS` but not re-typed there would have rendered in the select and been
  silently reset to "all". The filter and form schemas now build their enums from `AGE_BANDS`,
  `SPECIES_VALUES` and `SIZE_VALUES`.
- **The search rule was two copies that had already drifted once**; fixing the drift by editing one
  copy only reset the clock. Both now call `matchesPetSearch` in `src/lib/domain/petSearch.ts`.
- **A status and a track change in one batch** judged the track against the pre-batch status, so
  "Pending" could survive a switch to Rehabilitation. `updateFilters` now takes a function of the
  live filters in local mode.
- The Adoption Form preselect now tries the first adoptable animal in the shelter when none is on
  screen, and its comment no longer promises what `resolveDefaultPet`'s `allPets[0]` fallback
  cannot keep. Still untested — see above.
- `buildVisibleTrackOptions` and `buildPetTrackOptions` are one loop over the track sequence instead
  of a build, a rebuild and a sort.
- Two stale "step 6" citations in this stream now name the step; a misplaced `describe` separated
  a comment from the blocks it described.

**Not fixed here, recorded:**

- Sponsorship checkout (`src/actions/sponsorships.ts`) reads `findServerPetByIdAsync` too, so a
  posted `PET-001` pledges against fixture `pet-001`. Same repository fallback as the profile, so it
  went into `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md`, whose settling
  fix — return `null` after a successful read that finds no row — closes every caller at once
  instead of guarding each.
- `useSearchParams()` still runs on the home page even though `syncUrl: false` no longer reads it,
  which client-renders the featured strip up to its Suspense boundary. Pre-existing; the fix is
  splitting the URL and local controllers. Added to
  `tasks/open/gallery-filters-navigate-the-server-on-every-change.md`.
- A case-variant URL for a *live* animal now 404s rather than redirecting to its canonical id.
  Accepted: every id this app generates is canonical, and a redirect is a routing change, not a
  read fix.

Where the loop stops: review rounds keep producing findings, and past this point most are
cleanups. A further round blocks the merge only for a correctness defect, a security gap, or a
claim this PR makes that is false; anything else is recorded, not chased.

## Fourth code review — of rounds two and three (`/code-review xhigh`, 2026-09-16)

Rounds two and three were committed as `03accc5` once this review had covered them, so what
follows is its own small diff. Thirteen candidates, triaged against the bar above.

**The one that met it: a stored XSS on every pet profile.** The JSON-LD block on `/pets/[id]` was
`dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`. `JSON.stringify` leaves `<` alone,
and the HTML parser ends a script element at the first `</script>` whatever its `type`, so a pet
named `</script><script>…</script>` — 38 characters, inside the form's 60 — ran as script for every
visitor to that profile, staff included. Anyone with `MANAGE_PETS` could plant it. Pre-existing on
master, not introduced here; fixed here because this PR edits that function and it is the only
JSON-LD block in the codebase. `serializeJsonLd` replaces every `<` with its six-character JSON
unicode escape (backslash, u, 003c), which is what the Next 16 JSON-LD guide prescribes and which
`JSON.parse` reads back unchanged. *(This line first printed that escape literally, and the file
tool decoded it to `<` — "escapes `<` as `<`". The fifth review caught it in three files; the
code itself was checked byte-for-byte and by running it, and was never affected.)* Its test fails on the raw
payload when the escape is disabled. (Getting that mutation to apply took three tries: `sed` and
Windows argv both mangle a backslash beside a quote, and Git Bash rewrote the argument `/</g` into a
Windows path. A mutation that silently does not apply proves nothing, so the script used refuses
unless its pattern occurs exactly once.)

**Corrected, all small and all mine from the previous round:**

- `genderLabelArgs` moved from `validations/pet.ts` to `src/lib/presentation/petLabels.ts`. It
  builds display arguments; living in the validation module pulled zod schemas into four display
  components for a one-line label.
- The Adoption Form preselect's second fallback, `pets.find(isAdoptable)`, was dead:
  `resolveDefaultPet` already picks the first Available animal from the same array, and
  `isAdoptable` is true for exactly that status. Removed.
- `SPECIES_VALUES` and `SIZE_VALUES` now `satisfies` their domain types, and their docstrings — and
  the filter schema's — stop claiming the gallery renders from them. It does not: the species toggle
  and size select still hand-list.
- The `resolveFilters` comment said the schema "cannot drift from what the server … accept". The
  server never resolves its input through that schema; the comment now says so.
- `buildPetTrackOptions` is documented as the no-selection form the gallery no longer calls directly.
- Two knowingly-shipped limits gained the `ceiling:` marker AGENTS.md asks for.
- The gender tests stopped asserting that a stored `"male"` should display as Female. It does, and
  that is wrong for such a row; it is kept only so four components agree, and a test should not make
  it a requirement. They now pin what matters — a real key, no crash — and both still go red on the
  crash-shaped lookup.

**Not fixed — below the bar.** Each is an open question, so each lives in `tasks/open/`, not here
(this section first held them inline, which `tasks/README.md` forbids; the fifth review caught it):

- Tab counts vs the grid, a stale track-plus-status link, junk values left in the URL —
  `tasks/open/gallery-filter-url-state-edge-cases.md`.
- Non-canonical `gender` rows label wrongly and escape the filter —
  `tasks/open/pet-gender-column-accepts-values-the-labels-cannot-show.md`.
- `getPublicPets` does not validate its public input and disagrees with the gallery about bad
  values — `tasks/open/get-public-pets-trusts-its-filter-input.md`.

Accepted rather than open: `matchesPetSearch` re-normalises its query per pet, and in local mode
the setters change identity on each filter change. Neither is measurable at shelter scale.

## Fifth code review — of round four (`/code-review xhigh`, 2026-09-16)

Twelve candidates, same bar. **No security gap and no defect in the XSS fix itself** — but the one
that mattered most was about it.

**The comments on the security fix described a no-op.** Every place this round wrote the escape
sequence literally — `jsonLd.ts`, its test, and this file — the file-writing tool decoded it back
into `<`, so the comment read "escape `<` as `<`". The code was checked byte-for-byte and by running
the serialiser on `</script>` — it emits the six-character escape and no raw `<` — and was never
affected. But a comment on a security fix that describes a no-op invites someone to delete the fix.
Rewritten to spell the escape out in words, with a warning not to tidy it back.

**A preselect fix removed on one review's word was load-bearing.** The fourth review called the
gallery's second fallback, `pets.find(isAdoptable)`, dead because `resolveDefaultPet` picks the same
animal when handed `null`. It does — but the form copies a selection into its fields only when it
receives an actual pet (`if (selectedPet && open)`). Handed `null`, its title follows
`resolveDefaultPet` while `petId` keeps the last opening's value. Two reviews contradicted each
other, and the effect was not read before acting on the first. Restored, with a comment saying why.

Also corrected: the gender test checked key and fallback separately, so a mismatched pair would
pass — now checked as a pair; `serializeJsonLd` took `unknown`, and `JSON.stringify(undefined)`
returns `undefined`, not a string — now typed `object`; and four claims of mine that did not hold
(the label helper making every surface agree, moving it keeping zod out of components, `satisfies`
implying the lists are exhaustive, and a "tests below" pointer into another file).

Recorded, pre-existing: `resolveDefaultPet` falls back to `allPets[0]` whatever its status and
defines "adoptable" separately from `getPetStatusPresentation` — added to
`tasks/open/submit-application-checks-a-fixture-and-no-status.md`, the same adoption-flow thread;
and the JSON-LD price is built by deleting every non-digit from free text —
`tasks/open/pet-profile-json-ld-price-fuses-digits.md`, latent since every fixture fee is "Free".

# Home page loose ends, and the ledger mirrored into GitHub issues — review

**Branch:** `worktree-ledger-issues-mirror` · opened 2026-09-18 · base `85ee351`

_At the end of the file rather than prepended: PRs #46 and #72 prepend a stream at the top, and
two insertions at one line conflict, which would cost a security fix its CI run and its merge
button. A finished stream belongs in the archive once merged anyway; see
`tasks/lessons/2026-09-14-a-shared-todo-ledger-accumulates-finished-streams-until-it-conflicts.md`._

## What shipped

- [x] Four home page defects no open entry held, each checked at `85ee351` (most by a throwaway
      component test): `bulletins-are-a-per-browser-demo-anyone-can-edit`,
      `home-page-text-stays-english-on-the-malay-site`,
      `hero-mounts-a-quiz-and-sponsor-dialog-nothing-can-open`,
      `nav-links-point-at-home-sections-the-page-no-longer-renders`.
- [x] `scripts/ledger-issues.mjs` (`npm run ledger:issues`): a one-way mirror of `tasks/open/` into
      public issues labelled `ledger`. Rules and why: `tasks/decisions/2026-09-18-ledger-issues-are-a-one-way-mirror.md`.
- [x] `.github/workflows/ledger-issues.yml` runs it with `--apply` on push to `master`.
- [x] Published 2026-09-18 from `master`: #48–#71, one per entry. The home page entries and the
      workflow's own open entry publish when this branch merges and the workflow runs.

## Review

- Twelve `/code-review` passes — the branch, every fix round on its own, and the whole branch before
  the pull request — plus one probe found by running the script the way CI will. Until the last,
  every pass found real defects, and the fix rounds made some of their own:
  running from `tasks/` would have closed every issue; a depth-1 clone could not resolve
  `origin/master`; any stranger could plant a marker (fixed with the label gate); the label filter
  then moved the read onto the lagging search index (fixed with GraphQL `repository.issues`);
  four separate file-name shapes broke the marker until it was percent-encoded instead.
- Final state: 36 tests, 29 of 29 mutations killed, dry runs from the root, from `tasks/`, in a
  depth-1 clone, and paging five issues at a time. The whole-branch review found no correctness
  bug; its low findings are fixed — an empty fallback title, an overstated line in this stream.
  Generalising the first, one round made the sync keep going past a refused action; its review
  found that retired renamed entries and hammered rate limits, so it was reverted to stopping, and
  the entry-shaped refusals (a blank, long or control-character title, an oversized body) are
  prevented in the core instead.
- Two slips the per-round loop missed and the close-out gates caught. The per-round check ran
  vitest and eslint but not `tsc`, and vitest strips types without checking them, so a regex `s`
  flag this repo's ES2017 target rejects passed every round and failed only the final typecheck.
  And the edit tool stored `\u0000`-style escapes as raw bytes, turning the test file binary for
  every diff; see `tasks/lessons/2026-09-18-a-raw-nul-in-a-test-turns-it-binary-and-hides-it-from-review.md`.
- Registered kill condition — the marker survives GitHub — **SURVIVED**: the run straight after the
  first `--apply` printed `in sync, nothing to do`. Entry deleted, verdict in the decision record.
- The update and close paths ran for real too: `master` moved to `561ec62` (PR #47) mid-session,
  adding one entry, editing one and deleting a settled one. The sync created #74, updated #67 and
  closed #60 with the settling-commit hint, and the next run printed `in sync, nothing to do`.

## Deliberately not done

- **None of the four home page defects is fixed.** The ask was to write them up, and each needs an
  owner's decision first: bulletin persistence (P-D in `docs/tasks/TARGET_SCHEMA_TYPE_INTEGRITY.md`),
  FE-02's hero buttons against the undocumented "sitemap" in `home.test.tsx`, where the dead anchors
  should point.
- **PR #34's three unreproduced local failures were not filed.** They match the load-timeout pattern
  in two lessons and in `tasks/decisions/2026-09-08-admin-sponsorship-reconciliation.md`, and CI's
  test job passed on all eleven failed runs since 2026-09-08.
- **PR #34's "dedicated table" ceiling for the impact counters stays untracked**, as its author chose.
- **One open entry has no settle condition at all** (`sponsor-portal-is-inert-until-reconciliation-is-reachable`),
  and three write theirs as a `## Settles when` heading rather than the `**Settles when:**` line
  `tasks/README.md` asks for (`donation-form-and-admin-denials-have-loose-ends`,
  `matcherless-hook-wiring-unverified`, `production-schema-has-drifted-ahead-of-master`); the second
  of those also has two H1s. Noticed while building the mirror, which copes with all of it; not
  rewritten, because they belong to other sessions.
- **No two-way sync, and no run on `pull_request`.** Both are recorded as rejected in the decision.
- **The workflow has never run** — it cannot before it is on `master`. Open entry
  `ledger-issues-workflow-has-never-run`, with an agent-checkable settle condition.

## Settled 2026-09-21

Merged as `102763d` (squash). The workflow ran unprompted on that push and applied the plan its
log records — five creates, #76 to #80 — and a local dry run then printed `in sync, nothing to
do`, which is the settle condition the open entry registered. That entry is deleted in the same
commit as this note.

**Correction, same day.** That deletion was expected to make the mirror retire the entry's own
issue, #79, and it did not. GitHub read the closing keyword in the pull request body and closed
#79 itself, two seconds after the merge — and the push produced no workflow run at all, so the
sync never ran to be judged. Both are written up:
`tasks/lessons/2026-09-21-a-closing-keyword-can-fake-a-sync-that-never-ran.md` and, once the miss
was written off, `tasks/decisions/2026-09-21-the-mirror-syncs-at-the-next-matching-push.md`. A
manual dispatch reconciled the state at the time (run 35611053240, `in sync, nothing to do`).

**Closed out.** Runs have since been watched doing every job the script has, on pushes nobody
was steering: creating (35609339972, five issues; 35609643275, #81; 35611655318, #84), retiring
(35611516542 took #74 and #81 out when #72 and #73 merged; 35612411949 took #84 out), and
finding nothing to do (35611529886). Only the update path has never run in CI — it has run
locally, on #67. `master` at `04bebf4`: 27 entries, 32 issues, in sync.

It has since run unattended for someone else's merge: the owner merged #46 as `a6d1007` three
minutes later, and the workflow created #81 for the entry that merge added, with nobody watching.
Every path — create, update, close, and a run that finds nothing to do — has now happened against
GitHub rather than in a test.

CI for `102763d` shows **cancelled**, not failed: Playwright, static analysis and strict
persistence passed, and the unit job was still running when `a6d1007` superseded it, which is what
`cancel-in-progress` in `ci.yml` is for. The same tree passed every job on this branch beforehand.
