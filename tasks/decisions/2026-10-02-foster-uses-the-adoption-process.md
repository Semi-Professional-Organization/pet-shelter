# Foster uses the adoption process, so it moves under Adopt & Foster with a choice point

**Decided:** 2026-10-02 · stakeholder answer, relayed by the user

Closes `tasks/open/foster-placement-pending-stakeholder.md` (deleted). The stakeholder confirmed
that fostering follows the **same process as adoption** (application → meet & greet → approval).

**Choice:** Foster leaves Get Involved and joins Adoption as one "Adopt & Foster" path. Because the
process is shared but the commitment is not (a permanent home vs a temporary one while the animal
recovers), the visitor must **choose adopt or foster at one explicit point and branch from there** —
the user's requirement, not an inference.

**Why not keep Foster under Get Involved:** Get Involved now holds things done *for* the shelter
(routine volunteering, events, partnerships). Fostering takes an animal home through the adoption
application, so filing it with volunteering would send applicants to the wrong process.

**Consequence that is not cosmetic:** `AdoptionApplication` (`prisma/schema.prisma`) has no field
for the application's type, so a foster application cannot be recorded as one. Adding it is a
schema migration plus form, admin and tracking changes — GRAVE, midwife lane. Until it lands, the
branch can be built in the UI but must not pretend to submit a foster application as distinct.

Reverse this only if the stakeholder later says the two processes differ; then Foster returns to
Get Involved and the type field may be unnecessary.
