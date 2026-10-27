# The registration rate limiter is per-process, so it does not bound guessing a short invite code

**Status:** open · opened 2026-10-27

Carried over from `one-weak-secret-still-takes-the-whole-site-down`, which closed on 2026-10-27
(`tasks/decisions/2026-10-27-only-the-session-secret-can-stop-the-boot.md`) with this thread
still live.

`checkRateLimit` is a per-process `Map`. On Vercel each warm instance counts separately, so the
`register:ip:` and `register:email:` budgets in `registerAction` do not bound a caller spread
across instances or addresses. Since 2026-10-17 the owner may choose an invite code shorter than
the recommended 16 characters, and for such a code the limiter is the only thing slowing a guess.
The ceilings on `getStaffInviteSecret` and in `registerAction` say the same.

Shared state (a Postgres table or Redis) would fix it. Not built: it is its own change.

**Settles when:** the registration budgets are held in shared state, or a decision entry records
why a per-process limit is acceptable here.
