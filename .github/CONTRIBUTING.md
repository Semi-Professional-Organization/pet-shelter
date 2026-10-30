# Contributing to Pet Shelter

Thank you for your interest in contributing to the Hope for Strays pet shelter platform! This guide explains how to set up your environment, submit changes, and maintain code quality.

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. All contributors are expected to treat each other with respect and kindness. Please report any unacceptable behavior to the project maintainers.

---

## Getting Started

### 1. Fork & Clone

```bash
# Fork the repository on GitHub
# Then clone your fork locally:
git clone https://github.com/YOUR_GITHUB_USERNAME/pet-shelter.git
cd pet-shelter

# Add upstream remote to stay synced with main repo
git remote add upstream https://github.com/Semi-Professional-Organization/pet-shelter.git
```

### Clones made before the rename

The default branch was renamed from `master` to `main` on 2026-10-28, when the repository moved to
the Semi-Professional-Organization org. A clone made before then keeps tracking a frozen
`origin/master`, and orient says so when a session starts. Repair it once:

```bash
git remote set-branches origin '*'   # only if `git config --get-all remote.origin.fetch` lacks a `*`
git fetch origin --prune
git remote set-head origin -a
git branch -m master main            # if you have a local master and no local main yet
git branch -u origin/main main       # then point main at origin/main
```

If you already have a local `main`, switch to it and delete the stale local `master`
(`git switch main && git branch -d master`) instead of renaming it. The `set-branches` line is for single-branch and `--depth` clones, whose
fetch names `master` alone and fails after the rename. It replaces every fetch line, so skip it in
a full clone, and re-add any extra one you had (such as a `refs/pull/*` line) with
`git remote set-branches --add` afterwards.

In a fork set up as in step 1, `origin` is your fork. Rename its default branch to `main` on GitHub
(Settings → General → Default branch) and then run the steps as written. For `upstream`, run the
first three lines with `upstream` in place of `origin`.

Whichever remote points at the org repository (`origin` in a direct clone, `upstream` in a fork)
may still say `fergeley/pet-shelter`. That works through GitHub's redirect;
`git remote set-url <that remote> https://github.com/Semi-Professional-Organization/pet-shelter.git`
makes it explicit. Never point a fork's `origin` at the org repository.

### 2. Set Up Local Environment

Follow the setup guide in [`SETUP_AND_INSTALL.md`](SETUP_AND_INSTALL.md):

```bash
npm install
cp .env.example .env.local
# ... fill in .env.local with your database & API keys ...
npm run db:push
npm run db:seed
npm run dev
```

### 3. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/image-upload` — new feature
- `fix/login-bug` — bug fix
- `docs/update-readme` — documentation
- `refactor/auth-system` — code refactoring

---

## Development Workflow

### Writing Code

1. **Follow the architecture patterns** in [`docs/architecture/ARCHITECTURE_BLUEPRINT.md`](../docs/architecture/ARCHITECTURE_BLUEPRINT.md):
   - Use server actions for data mutations
   - Validate all inputs with Zod
   - Use the FSM pattern for state transitions
   - Implement RBAC guards for authorization

2. **Match the design system** in [`docs/design-system.md`](../docs/design-system.md):
   - Use theme tokens from CSS variables
   - Apply consistent border radius (squircle style)
   - Keep the warm, approachable brand palette

3. **Write tests first** (TDD):
   ```bash
   npm run test:watch
   ```
   - Unit tests live in `tests/unit/`
   - Test file naming: `{feature}.test.ts`
   - Aim for high coverage, especially for critical paths

4. **Type safety**:
   ```bash
   npx tsc --noEmit
   ```
   All TypeScript must compile without errors.

5. **Code quality**:
   ```bash
   npm run lint -- --fix
   ```
   ESLint and Prettier will auto-format your code.

### Database Changes

If your feature requires schema changes:

1. Edit `prisma/schema.prisma`
2. Sync to database:
   ```bash
   npm run db:push
   ```
3. Regenerate types:
   ```bash
   npm run db:generate
   ```
4. Update seed data in `prisma/seed.ts` if needed

### Commit Guidelines

**The standard is [`docs/reference/COMMIT_MESSAGES.md`](../docs/reference/COMMIT_MESSAGES.md)** —
Chris Beams' seven rules over this repo's Conventional Commits grammar. It is the only copy; this
page deliberately restates none of it.

The shape, so you know what you are looking at:

```
type(scope): Imperative summary, capitalized, no period

Body prose explaining what changed and why, wrapped at 72 columns.
The diff already says how.
```

Check a message before you commit, and install the hook that checks it for you:

```bash
npm run commit:check -- "$(git rev-parse --git-path COMMIT_EDITMSG)"   # lint one message
npm run commit:audit                          # report on existing history
npm run commit:hook                           # install the commit-msg hook (opt-in)
```

---

## Before Submitting a Pull Request

### 1. Run All Checks

```bash
# Lint code
npm run lint -- --fix

# Type-check
npx tsc --noEmit

# Run tests
npm test

# Build
npm run build
```

All checks must pass before opening a PR.

### 2. Sync with Main Branch

```bash
git fetch upstream
git rebase upstream/main
```

If there are conflicts, resolve them and continue:
```bash
git rebase --continue
```

### 3. Force-Push to Your Fork

```bash
git push origin feature/your-feature-name --force-with-lease
```

---

## Submitting a Pull Request

### PR Title

Use the same format as commit messages — see
[`docs/reference/COMMIT_MESSAGES.md`](../docs/reference/COMMIT_MESSAGES.md):

- `feat(pets): Add image upload for pet listings`
- `fix(applications): Resolve the race condition in status updates`
- `docs(setup): Add the deployment guide`

### PR Description

Include:
1. **What does this PR do?** (1-2 sentences)
2. **Why is this change needed?** (context & motivation)
3. **How does it work?** (brief technical summary)
4. **Testing**: How to verify the changes work
5. **Breaking changes?** (if any)
6. **Related issues** (if applicable, e.g., `Closes #42`)

Example:
```markdown
## What
Implements image drag-and-drop uploader for pet listings.

## Why
Currently, admins must manually enter image URLs. This feature allows direct file uploads with preview.

## How
- New component: `src/components/admin/ImageUpload.tsx` (React dropzone)
- New API route: `src/app/api/upload/route.ts` (storage backend)
- Integrates with `PetFormDialog` to replace URL inputs

## Testing
1. Navigate to `/admin/pets/new`
2. Drag images onto the upload zone
3. Verify preview displays and submit form saves image URLs

## Related
Closes #18 — "Add media upload feature"
```

### PR Checklist

Before hitting "Create Pull Request", verify:

- [ ] All tests pass: `npm test`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Code is linted: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Commits are atomic and descriptive
- [ ] No `.env.local` or secrets committed
- [ ] PR title follows conventional commit format
- [ ] PR description explains the change clearly

---

## Code Review Process

### What to Expect

1. **Automated checks** run first (linting, type-checking, tests)
2. **Maintainers** review the code for:
   - Architectural alignment
   - Security & performance
   - Test coverage
   - Design system consistency
   - Documentation quality
3. **Feedback** is provided as comments on specific lines
4. **Your response**: Discuss or implement suggestions
5. **Approval & merge**: Once all feedback is addressed

### How to Respond to Review

- Address all feedback comments (reply or implement changes)
- Push new commits to the same branch
- Request re-review after addressing feedback
- Polite disagreement is okay—explain your reasoning clearly

### Merging into `main`

`main` takes changes only through a pull request, squash-merged, once six checks pass:
`Static & architecture analysis`, `Production build`, `Unit, integration & component tests`,
`Strict persistence against Postgres`, `Playwright golden paths` and `Commit messages`.
Vercel's preview status is not one of them: Vercel decides whether to deploy a commit by who wrote
it, so it may never report on a pull request that Dependabot opens. No approval is required.
Nobody can push, force-push or delete `main` directly, maintainers included. The rule is the
repository ruleset "Basic" (Settings → Rules → Rulesets), active with all six checks on the
default branch (`master` until 2026-10-28, when it was renamed `main`); how it was verified is in
[`tasks/decisions/2026-10-21-the-master-ruleset-is-on-and-does-not-block-green-pull-requests.md`](../tasks/decisions/2026-10-21-the-master-ruleset-is-on-and-does-not-block-green-pull-requests.md).
The reasons are in
[`tasks/decisions/2026-10-20-master-merges-only-green-squashed-pull-requests.md`](../tasks/decisions/2026-10-20-master-merges-only-green-squashed-pull-requests.md).

- **Renaming a CI job renames its check.** The rename cannot merge until the ruleset requires the
  new name, so update the ruleset just before merging it, then merge `main` into any other open
  pull request so that it reports the new name too.
- **When a check is down rather than red** (a GitHub or Vercel outage), a maintainer can set the
  ruleset's enforcement to Disabled, merge, and set it back to Active. Merging a red pull request
  is not that case: it is how the default branch broke twice in September 2026.

---

## Common Patterns & Anti-Patterns

### ✅ Do

- Use server actions for mutations: `"use server"` at top of file
- Validate inputs with Zod at the perimeter
- Use declarative RBAC guards: `assertAuthorized(user, ["ADMIN"])`
- Keep state centralized (single source of truth)
- Use the design system tokens for colors, spacing, radius
- Write tests for critical business logic
- Keep commits small and atomic

### ❌ Don't

- Store secrets in `.env.local` then commit it (use `.env.example` instead)
- Make multiple unrelated changes in one commit
- Skip tests "just this once"
- Use hardcoded color values (use CSS variables & Tailwind tokens)
- Introduce new third-party dependencies without discussion
- Leave `console.log()` or `debugger;` statements in production code
- Break the RBAC model or FSM patterns

---

## Running Tests Locally

### Unit Tests

```bash
# Run all tests once
npm test

# Run in watch mode (re-run on file change)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Tests live in `tests/unit/` and use Vitest + @testing-library.

### E2E Tests (Future)

When E2E tests are implemented:

```bash
npx playwright test
```

---

## Documentation

If your change affects:

- **Architecture**: Update [`docs/architecture/ARCHITECTURE_BLUEPRINT.md`](../docs/architecture/ARCHITECTURE_BLUEPRINT.md)
- **Operations**: Update [`docs/runbooks/OPERATIONAL_RUNBOOK.md`](../docs/runbooks/OPERATIONAL_RUNBOOK.md)
- **UI/Design**: Update [`docs/design-system.md`](../docs/design-system.md)
- **Onboarding**: Update [`docs/setup.md`](../docs/setup.md)
- **Roadmap**: Update [`docs/archives/HANDOFF_AND_NEXT_TASKS.md`](../docs/archives/HANDOFF_AND_NEXT_TASKS.md)

Include documentation changes in the same PR.

---

## Reporting Issues

Found a bug or have a feature request?

1. Check existing issues to avoid duplicates
2. Include:
   - **What happened?** (expected vs actual behavior)
   - **Steps to reproduce**
   - **Environment** (OS, Node version, browser)
   - **Screenshots** (if UI-related)

---

## Questions?

- **Architecture**: See [`docs/architecture/ARCHITECTURE_BLUEPRINT.md`](../docs/architecture/ARCHITECTURE_BLUEPRINT.md)
- **Operations**: See [`docs/runbooks/OPERATIONAL_RUNBOOK.md`](../docs/runbooks/OPERATIONAL_RUNBOOK.md)
- **Setup Issues**: See [`docs/setup.md`](../docs/setup.md)
- **Design Questions**: See [`docs/design-system.md`](../docs/design-system.md)

---

## License

By contributing, you agree that your code will be licensed under the project's current license (check `LICENSE` file).

---

**Thank you for contributing to Hope for Strays! 🐾**

Your work helps rescue animals find their forever homes.

---

**Last Updated**: 2026-08-15
