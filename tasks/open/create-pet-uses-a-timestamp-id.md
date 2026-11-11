# Creating a pet uses a timestamp id that can collide

**Status:** ASSERTED · opened 2026-11-11 · found by review while fixing #201, reasoned from the code

`createPet` in `src/actions/pets.ts` builds `pet-${Date.now()}` (and the client pet store does the
same). Two creates in the same millisecond collide, the insert raises P2002 on `id`, and the
action's catch returns Prisma's text to staff. It is the shape #201 fixed for applications, on a
staff-only path.

**Settles when:** pet ids cannot collide, or a collision is retried, pinned by a test that makes
the first insert raise P2002 on `id`.
