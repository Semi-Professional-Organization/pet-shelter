# No bank-transfer route is offered before the pledge reference exists

**Decided:** 2026-11-06

While `SHELTER_BANK_ACCOUNT` is `null` (#252), `BankTransferDetails` shows no WhatsApp link
before the donor has recorded a pledge; it asks them to record one first, and the pledge screen
then links to WhatsApp with the `HFS-` reference in the message.

Why: a request with no reference gets an account the donor can pay with nothing to quote, and
the coordinator then has an unmatched line on the statement and no pledge to confirm. The
pet-sponsorship path already withheld transfer details until the reference existed for the same
reason. Offering the link up front is the reversal this records against.

Not decided: whether a confirmed account should also wait for the reference on `/donate` and
the popup's general gift, as it did not before #281. That is left to the PR that fills it in
(`tasks/open/the-shelter-bank-account-is-not-confirmed.md`).
