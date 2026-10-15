# When the defect is silence, move the rows — do not add a where clause

**Learned:** 2026-09-22

The donation brief's fourth item asked to "verify that LHDN tax export readers filter out
unconfirmed donation pledges". Taken literally that is a `where` clause on three readers:
`listDonations` (an admin panel), `listDonationsOrThrow` (the statutory export), and
`findDonationByReceiptNumber` (the sponsor portal's account-claim challenge). Three today, and
however many a future contributor adds.

Putting unconfirmed gifts in a separate table instead means there is no filter to write and none
to forget. `fetchDonationReceiptsAction` reads `donations`; a pending gift is in
`donation_pledges` and has no receipt number at all, so it cannot reach an annual return however
that query is later rewritten, by anyone, including someone who has never heard of this change.

The asymmetry that decides it is the *cost of being wrong*, not the cost of writing it. A missing
filter on a tax export does not throw, does not log, and does not look wrong: it produces a
plausible, well-formed annual return with extra money on it. The original defect had exactly that
shape — an unverified gift was indistinguishable from a verified one once both were rows in
`donations`. A second silent failure mode is not a fix.

The same reasoning is already written down next door, for reads rather than writes:
`listDonationsOrThrow` exists because `listDonations` returns `[]` on a read failure, and "an
empty result is not a degraded view but a *claim* — that the shelter received no donations — and
it is indistinguishable from the truthful version of that claim."

**Rule:** when a defect's failure mode is silent, prefer a design in which the wrong state cannot
be represented over one in which it is filtered out. Ask "what does a future reader who knows
nothing about this get by default?" — if the honest answer depends on them remembering a
predicate, move the rows instead. Reserve the filter for cases where a mistake is loud.
