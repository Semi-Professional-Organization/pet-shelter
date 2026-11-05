# Address budgets key the whole IPv6 address, so one host can rotate past them

**Status:** open · opened 2026-11-05

Found in review of #213. `checkAddressRateLimit` keys every budget on the full address
`getClientAddress()` returns. One IPv6 host usually controls at least a /64, so it can send each
attempt from a fresh address and never spend a second try on any one key. That holds for every
address budget (login, registration, sponsor sign-in, applications), and it was true before #213
moved the registration budgets to Postgres. Whether Vercel's edge passes IPv6 client addresses in
`x-vercel-forwarded-for` has not been checked.

The usual fix is to key IPv6 addresses on their /64 prefix. It changes every address budget at
once, so it is its own change.

**Settles when:** IPv6 addresses are bucketed by prefix, or a decision entry records why the full
address is acceptable here.
