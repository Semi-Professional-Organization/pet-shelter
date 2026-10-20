# node:readline cuts a JSONL record in half at a raw U+2028

**Learned:** 2026-10-20

**What happened:** `scripts/agent/usage.mjs` first read Claude Code transcripts with
`readline.createInterface`, the usual way to stream a JSONL file in Node. 78 records failed
`JSON.parse` with "Unterminated string". The same files split on `"\n"` parsed with no error.
`readline` ends a line at U+2028 and U+2029 as well as at `\n` and `\r`, and JSON allows both
characters raw inside a string, so a tool result quoting text that contained one was cut in two.
The failures were silent until the malformed-line count was printed, and they landed in exactly
the long tool results a cost measurement most needs.

**Rule:** to stream JSONL, split on `"\n"` yourself (`jsonlLines` in `scripts/agent/usage.mjs`),
never with `node:readline`. Wherever a parser skips lines it cannot read, count the skips and
report the count, so a reader that loses records cannot pass for one that read them all.
