# An offline seed failure outlives the call that hit it

**Status:** open · opened 2026-10-20

With no database, `userStore.ts` and `sponsorRepository.ts` seed their demo accounts on first use,
and the seeding derives scrypt hashes. If a derivation fails, `ensureInitialized()` (staff) and
`ensureInitialised()` (sponsors) keep the rejected `initPromise`. Every later call, such as a
sign-in or a wall listing, rethrows the same error until the process restarts. Only the test
resets (`resetUserStore()`, `resetSponsorRepository()`) clear it.

Found by review of the pull request that cached the seed hashes (2026-10-20), and older than it:
both stores already behaved this way. That change made the hash caches themselves clear on
failure, so a test reset recovers. It did not touch `initPromise`, because the behaviour is not
CI's and the fix is a product decision: should offline seeding retry on the next call, or fail
loudly once? Not observed outside a test. Producing it means scrypt failing, which takes memory
pressure or a mock.

A planned change to precomputed seed hashes would remove the failure path altogether, since
nothing would be derived at runtime.

**Settles when:** either the seed hashes are precomputed, or both `ensureInit…` functions clear
`initPromise` on rejection, with a test that calls the store twice after a failed first
derivation and expects the second call to succeed.
