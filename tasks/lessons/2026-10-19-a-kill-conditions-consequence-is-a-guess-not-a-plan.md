# A kill condition's consequence clause is a guess, not a plan

**Learned:** 2026-10-19

The role dead-end session registered K1 before a browser run: if a Staff sign-in had not settled
on `/admin/applications` within 10 seconds, the server-side `/admin` dispatcher was dead "and the
landing must be chosen on the client". K1 fired. The corpse showed the cause was the admin layout's
stale signed-out state, which bounces any client-side push into the console — so the alternative
the condition had prescribed would have fired K1 too. Kill conditions are immutable, and that
clause read as a commitment to a fix chosen before the evidence existed.

**Rule:** register the observable and the death, nothing after. What replaces the dead design is
Phase 0's question, answered with the corpse in view, not a clause written in advance.
