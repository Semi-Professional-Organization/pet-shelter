# One weak secret still takes the whole site down at boot

**Status:** open · opened 2026-10-17

`src/instrumentation.ts` runs `assertSecretsConfigured()` when the server starts. If any of
the three authentication secrets is unset, still the development default, or (for the session
and admin secrets) too short, the server refuses to start. **Every public page then returns
HTTP 500**, including pages that need no secret at all.

That happened in production on 2026-10-17: a staff invite code under 16 characters took the
site down. The fix that shipped
(`tasks/decisions/2026-10-17-the-staff-invite-code-length-is-the-operators-call.md`) lets the
invite code be any length. It does not change the mechanism, so the same outage still follows
from:

- an `ADMIN_SECRET_KEY` under 16 characters;
- an invite code set to a value this repository publishes;
- any secret left unset.

That fix also adds **new** refusals for the session and admin keys: any secret's development
default (not only its own), a default with its `.env.example` quotes left on, and any
placeholder an older `.env.example` published.
Both are right, because a deployment configured that way is running on a key anyone can read
in this repository. But a deployment that happens to be configured that way today would stop
booting on its next deploy. **Check the production values of all three secrets before
deploying it.** The invite code gains the same refusals, and also in any letter case.

## The upgrade path

Limit each secret's failure to the feature it gates. A weak invite code would disable staff
sign-up and log loudly, while the public site boots. `SESSION_SECRET` probably has to stay
fatal, because without it no session can be signed or checked. The others need not be.

Related, and separate: the rate limiter is per-process, so on a serverless host it does not
bound guessing a short invite code. Shared state (Postgres or Redis) would fix that.

**Settles when:** a weak non-session secret no longer prevents the public site from booting, or
a decision entry records why it should.
