# A hand-off's header is read by position, and its body is checked for headings only

**Decided:** 2026-10-21

`scripts/agent/handoff.mjs` writes a hand-off's header (title, opened date, session) from one list
of lines and reads it back by matching each line against its own pattern, nothing else. Before,
it read the header with regexes that searched the whole file. A title or body holding a field's
words was read as that field: a hand-off titled "Migration opened 2020-01-01 by mistake" was listed
as opened on 2020-01-01, and round 7 of the meter's review found a title quoting the session field
read as the session.

## The fences this removed

`checkBody` refused a body with its own H1 or with a line shaped like a header field, and to avoid
refusing pasted code it modelled CommonMark fences (indent, info strings, closing rules). Those
rules existed only to keep the body from posing as the header, so with the header read by position
they protect nothing and are gone. Rounds 6 and 7 of the meter's review found eight inputs where
the fence model disagreed with how the file renders; that class of finding goes with it.

What `checkBody` still checks: each of the six sections is a `## ` heading at the start of a line
with something under it. Its stated ceiling: a heading pasted inside a code block counts as the
section, which lets a body through and never refuses one.

## What would reverse this

A reader that needs more of the file than the header, or a hand-off format whose header is no
longer the first eight lines. Either should extend the line list in `handoff.mjs`, not go back to
searching the file.

Plan: the "Context meter: root-cause plan" doc, root 3; the owner's go on 2026-10-21. Lesson:
`tasks/lessons/2026-10-21-when-review-keeps-finding-edge-cases-in-a-hand-written-parser-shrink-the-check.md`.
