# Seven unit suites are authorized by the DAL's fallback, not by the member check they look like they pass

**Status:** open · opened 2026-10-20 · measured on the test-harness branch; replaces the volunteerForm lead in the closed `unit-suite-is-order-dependent-in-both-directions`

`readVerifiedSession` (`src/lib/security/dal.ts`) re-reads the signed-in member on every guarded
call, and its `catch` hands back the cookie's own claims when that read throws. Its comment
describes the case as an unreachable database; the `catch` takes any error. In the unit tier the
read always throws (with no `DATABASE_URL` the client refuses with P1001), so a suite that mocks
`getCurrentSession` with an id no store holds is authorized by that fallback and never by the
member check.

Measured by making the `catch` return `null` and running the unit, integration and component
tiers: `8 failed | 130 passed (138)`, `63 failed (2291)`. Seven of the eight files rely on the
fallback without saying so: `volunteerForm`, `settings`, `settingsAuthorization`,
`softDeleteAndAuth`, `rehabilitation`, `donationReconciliationBoundary` and
`sponsorshipReconciliation` (all under `tests/unit/`). The eighth, `security/authSessionDal`,
tests the fallback itself and is meant to fail.

So a regression in the member check (a role no longer refreshed from the row, a suspended member
let through) would leave those seven green. The same defect was fixed in this branch for
`adminPetsAuthorization` and `petHistory`, by signing in with `signInAs` and answering the member
lookup with `findMemberRow` (`tests/setup/authSession.ts`), as `donationQrAudit` already did.

Before 2026-10-20 the same suites hit the same fallback on CI (nothing listens on port 5432
there) and failed on machines with a local Postgres, which was one face of the old
order-dependence entry.

**Settles when:** each of the seven signs in through `signInAs` with its lookup answered by
`findMemberRow`, and the probe above fails only `security/authSessionDal`; or a test documents
why a suite is meant to run on the fallback.
