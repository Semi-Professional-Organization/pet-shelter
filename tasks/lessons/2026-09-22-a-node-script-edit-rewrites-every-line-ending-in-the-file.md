# A node script edit rewrites every line ending, and the diff hides what changed

**Learned:** 2026-09-22

Auto mode steers file changes to `cat >`, `sed -i` and short `node -e` scripts. A `node -e` pass
over `src/components/layout/Hero.tsx` that deleted seventeen lines read the file, split on
`/\r?\n/`, and wrote `out.join("\n")`.

`core.autocrlf` is `true` on this machine and `.gitattributes` is deliberately narrow — only
`.claude/hooks/*` is pinned to LF — so the tree is checked out CRLF. The rewrite silently converted
the whole file to LF. `git diff` then reported every line of a 250-line file as changed, and
`git status` warned "LF will be replaced by CRLF the next time Git touches it". The same script
applied to `tests/components/home.test.tsx` also dropped its trailing newline, so a file that was
meant to end up byte-identical to `HEAD` showed as fully rewritten with
`\ No newline at end of file`.

Nothing failed. `tsc`, ESLint and the suites are all indifferent, and the commit would have stored
normalised content anyway. The cost is at review: a diff where every line moved cannot be read, and
the seventeen real deletions were invisible until `git diff -w` was run against it. On a shared
branch that is also a conflict surface against every concurrent session touching the file.

**Rule:** a script that rewrites a whole file here joins with `\r\n` and preserves the trailing
newline, or the file is restored from `HEAD` and edited with a tool that patches in place. After
any whole-file rewrite, read `git diff --stat` before staging: a line count far larger than the
edit means the endings moved, not the code. `git diff -w` tells you which it was.
