# A fabricated error object can only agree with the reading it was built from

**Learned:** 2026-10-13

The pledge-reference collision retry decided what to retry from `err.meta.target`. So did
`isReferenceCodeCollision` in `src/actions/applications.ts`, which had shipped earlier. Both had
unit tests, and both suites were green.

Prisma 7 with `@prisma/adapter-pg` never sets `meta.target`. A real duplicate insert raises

    { code: "P2002", meta: { modelName: "DonationPledge", driverAdapterError: { cause: {
        originalMessage: '... violates unique constraint "donation_pledges_pledgeRef_key"',
        kind: "UniqueConstraintViolation", constraint: { fields: ['"pledgeRef"'] } } } } }

So the adoption retry had never fired once, and the gift lane's guard against retrying a
`receiptNumber` collision was dead code. Every test covering either built its error by hand with a
`target` key — the tests encoded the author's belief about the error and then confirmed the code
agreed with that belief.

It took three review rounds to get from "the predicate is gated on an unmeasured field" to the
captured object above, and the second-to-last fix made the same mistake one level down: it
replaced a fixture transcribed from memory with one transcribed from reading `node_modules`.
Closer, and still not an observation. What ended it was four minutes with a real server.

**Rule:** when code branches on the shape of an error raised by a dependency, the fixture in its
test must be *captured* from that dependency, not written. Record where and when it was captured
beside the fixture, and keep one test in the tier that talks to the real thing asserting the
premise itself — here, that `meta.target` is undefined — so an upgrade that changes the shape
fails loudly. If the real thing cannot be reached, say the fixture is a belief; do not let a green
suite say otherwise.
