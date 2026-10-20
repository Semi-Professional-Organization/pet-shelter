# Check a CI proposal against the vendor's docs and the repo's own gates before proposing it

**Learned:** 2026-10-20

**What happened:** A CI review measured the runs well, then proposed changes that had not been
checked against anything. The owner approved them and asked for the details to be critiqued
before building, and that pass, plus two review rounds, overturned or reshaped five of them:

- Caching Playwright's browsers: Playwright's own CI guide advises against it, and about half of
  the install step was apt packages that no cache can hold.
- Dependabot: its pull request titles and commit bodies have to pass this repo's commit-message
  check, which nobody had considered.
- A required `Commit messages` check: it ran only on pushes, so a fixed title would have stayed
  blocked until the next push.
- A required `Vercel` check: Vercel decides by commit author, which would have blocked
  Dependabot.
- Node 22 in CI: Vercel's documented mapping of the open `engines` range puts production on 24.

**Rule:** for each proposed CI change, write down three things before proposing it. First, the
vendor's own guidance on the change. Second, every gate this repo already runs that the change's
output must pass: bot titles against the commit standard, renamed jobs against required checks.
Third, which event re-evaluates a check once it is required. A proposal that cannot answer all
three is a question, not a recommendation.
