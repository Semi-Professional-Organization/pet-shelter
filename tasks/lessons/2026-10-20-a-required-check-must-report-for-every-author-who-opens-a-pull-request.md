# A required check must report for every author who opens a pull request

**Learned:** 2026-10-20

**What happened:** The first plan to protect `master` required Vercel's `Vercel` commit status,
because Vercel's preview was the only place `next build` ran. All 15 of the most recently merged
pull requests carried that status, so it looked universal. Review found that Vercel checks a
commit's author before it deploys, and blocks an author without access to the project; on a Hobby
team, that is anyone but the owner. Every one of the last 200 commits on `master` was the owner's,
so the sample could never have shown the gap. The same change was adding Dependabot, whose commits
are its own: a required `Vercel` check would have kept every Dependabot pull request blocked. CI
gained its own `Production build` job instead, and `Vercel` stayed informational.

**Rule:** before making a status a required check, list who will open pull requests (each human,
each bot, forks) and confirm the check reports for every one of them, not just for the history
you sampled. If its producer decides by author, plan, or anything else outside this repository,
run the same check in this repository's own CI and require that one instead.
