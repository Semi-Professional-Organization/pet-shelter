# When review keeps finding edge cases in a hand-written parser, shrink the check

**Learned:** 2026-10-21

`ledger handoff` refuses a hand-off body without its six sections. To keep a heading inside a code
block from counting, round 1 added a one-line fence toggle to `checkBody` in
`scripts/agent/handoff.mjs`. Rounds 6 and 7 of the meter's review then found eight inputs where
the toggle disagreed with how the file renders: a `~~~` inside a backtick block, a fence indented
four spaces or by a tab, inline triple-backtick code, a field quoted inside a fence. Each fix
was correct, and each made the next finding possible: the agent scripts take no dependencies, so
there was no real markdown parser to hand the job to, and the toggle grew toward a partial
CommonMark. Those two rounds held the merge at round 7. Meanwhile the check guards against a mild
failure: a heading pasted inside a code block would count as a section.

**Rule:** before writing a parser for a format with a published grammar, ask whether the check
needs the grammar at all. If a dumber check is enough (here: the six headings at line start),
ship that and state its ceiling. If it isn't, use a real parser. When a second review round finds
edge cases in the same parser, stop fixing cases and reconsider which of those two it should be.
