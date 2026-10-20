# Dependabot updates Actions weekly and npm only for security

**Decided:** 2026-10-20, by the owner, approving the plan in the project thread.

`.github/dependabot.yml` has two entries. The npm one works only once the repository settings
turn on Dependabot alerts and Dependabot security updates, and on 2026-10-20 both were off
(`gh api repos/fergeley/pet-shelter/vulnerability-alerts` answered 404, and
`automated-security-fixes` answered `enabled: false`). Switching them on is the owner's step.

## GitHub Actions: weekly, grouped, a week behind

The workflows pin every action to a commit SHA, with its release as a comment. A pin without an
updater rots. Dependabot's `github-actions` updates rewrite both the SHA and the comment.

- **Grouped**, so a week's bumps arrive as one pull request instead of one per action.
- **`cooldown: default-days: 7`**: a release must be a week old before Dependabot proposes it. The
  supply-chain attacks this guards against publish a malicious release that is usually caught
  and withdrawn within days, and a week behind costs nothing for actions this stable.

## npm: security updates only

`open-pull-requests-limit: 0` turns version updates off. Security updates do not count against
that limit and are governed by the repository setting, so vulnerable dependencies still get a pull
request. Routine version bumps stay off because the ones that matter here, Next.js, React and
Prisma, each need a person to read migration notes before upgrading (`AGENTS.md`: this is not
the Next.js you know). A weekly bot pull request for them is noise at best and a broken `master`
at worst, and two developers would be reviewing it every week.

## How its pull requests meet the commit standard

The `Commit messages` check lints every pull request title. Dependabot's titles follow
`commit-message.prefix` with `include: scope`, giving `ci(deps): …` and `build(deps): …`.

Whether it capitalizes the word after the colon, which rule 3 requires, is **reasoned, not
observed**. Dependabot's `PrNamePrefixer.capitalize_first_word?` (dependabot-core,
`common/lib/dependabot/pull_request_creator/pr_name_prefixer.rb`) first looks for its own last
commit by the address `support@dependabot.com`, which GitHub's Dependabot does not commit as. So
in practice it decides from the last 100 commits on the default branch, leaving out bots and
`Merge` subjects, and it capitalizes when every Conventional Commit among them is capitalized
after the colon. On 2026-10-20 that held for all 89 of them, and squash-only merging of linted
titles keeps it so. If that lookup fails, for instance on an API error, it falls back to
lowercase. Then the check fails, a person edits the title, and the `edited` trigger reruns it.

Vercel may not deploy Dependabot's commits, because it checks a commit's author first. Its
status on those pull requests is informational: `Production build` in CI is the required build.

Its commit **bodies** are not linted (`.github/workflows/commit-messages.yml` skips the audit for
pull requests it opened). They quote release notes that cannot meet the 72-column wrap, and its
commits never reach `master` under squash-only merging.

## Reversing it

Delete `.github/dependabot.yml`, or set the Actions entry's interval to `monthly` for less noise.
To get npm version updates, remove `open-pull-requests-limit: 0` and add a `groups:` entry so
they arrive as one pull request.
