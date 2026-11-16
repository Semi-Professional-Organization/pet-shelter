---
name: commit-message-writer
description: Write and validate repository-compliant Conventional Commit messages and pull request titles from the current diff.
---

# Commit message writer

Use this skill whenever the user asks for a commit message, wants to commit changes, asks to push a change, or needs a pull request title/description based on the current work.

## Required workflow

1. Read `docs/reference/COMMIT_MESSAGES.md` before composing a message.
2. Inspect `git status --short` and the relevant diff. Never include unrelated or pre-existing changes.
3. Choose exactly one Conventional Commits type and one optional lowercase kebab-case scope.
4. Write a subject in this form:

   ```
   type(scope): Imperative summary
   ```

   The summary must:
   - start with an uppercase letter after the colon;
   - use the imperative mood;
   - have no trailing period;
   - target 50 characters or fewer and never exceed 72 characters.
5. Add a body unless the subject is genuinely the whole truth. Explain what was wrong, why it mattered, and the result. Do not narrate implementation steps that the diff already shows.
6. Wrap prose at 72 columns.
7. Add `Verified:` only for checks actually run, with concise results. Add `Ledger:` or `Refs:` only when applicable.
8. Preserve an existing `Co-Authored-By:` trailer when amending. Never invent or hardcode a co-author trailer for a new message.
9. Write the message to a scratch/session file, not the repository. Validate it with:

   ```powershell
   npm run commit:check -- <message-file>
   ```

10. When committing, use explicit paths and a message file:

    ```powershell
    git add -- <paths>
    git diff --cached --name-only
    git commit -F <message-file> -- <same paths>
    ```

    Never use `git add -A`, `git add .`, `git commit -a`, or `git commit -m`.

## Pull request titles and descriptions

Use the same validated subject as the pull request title because CI lints the title as the squash-merge subject. The description should briefly state:

- the problem;
- the fix;
- verification performed;
- any intentionally uncommitted or unrelated work left untouched.

If the user asks to amend a pushed commit, explain that the PR title is separate from the commit subject and must also be updated. Ask before force-pushing rewritten history.

## Clarifications

Ask only when the diff cannot establish the type, scope, user-visible impact, or verification status. Otherwise choose the narrowest accurate wording and state the assumptions.
