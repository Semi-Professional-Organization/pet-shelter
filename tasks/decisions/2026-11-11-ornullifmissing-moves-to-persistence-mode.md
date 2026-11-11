# The P2025 check and `orNullIfMissing` move to `persistenceMode`

**Decided:** 2026-11-11

Reverses the "declined" item in
`tasks/decisions/2026-09-22-bulletins-get-a-server-side-store.md` (rounds six and seven): "moving
`orNullIfMissing` to a shared module … wait for a third occurrence."

The third occurrence arrived with the #210/#211 fix. `updateServerPet` in
`src/lib/server/petRepository.ts` needed to tell "the row was not there" (Prisma P2025) from an
outage, which made the P2025 test itself a third copy beside the bulletin and transparency
repositories. AGENTS.md "Boundaries and duplication" says to abstract at that point, so
`isRecordNotFound` now lives in `src/lib/persistenceMode.ts`, beside the repository layer's other
Prisma error decisions (`handlePersistenceError`, the P2002 check). `orNullIfMissing`, the wrapper
the two older copies were built around, moved with it rather than staying as two private wrappers
over a shared predicate. The pet repository uses the predicate only, because its write must also
route other failures through `handlePersistenceError`.

Behaviour is unchanged: both wrappers already returned `null` on P2025 and rethrew everything
else, and the bulletin and transparency suites pass unmodified.
