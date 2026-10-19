# A transcript line is not a request, and a user record is not a person

**Learned:** 2026-10-20

**What happened:** Building `usage`, eight review rounds each found another place where the
obvious reading of a Claude Code transcript was wrong:

- One model request is written as several `assistant` lines sharing a `requestId`, and they need
  not be adjacent. Each repeats the usage block, and `output_tokens` grows line by line, so taking
  the first line undercounted output (10% of cost was really 12.4%).
- A fork or a relocated subagent copies its parent's history, requests and `compact_boundary`
  records included, into a new file. Counted per file, the same request is billed twice and an
  old compaction lands at the start of the fork.
- A `user` record with no tool result is a person only when `origin.kind` is `human` (or, in
  older transcripts, absent). Background-task notices, other sessions' messages, meta records and
  compaction summaries are user records too. Telling them apart moved the count of "cold resumes
  on a person's message" from 51 to 43.
- A cache re-write after an hour idle is not always avoidable idleness: a compaction re-writes a
  new context anyway, and a 5-minute cache expires after 5 minutes.

**Rule:** before trusting a count from transcripts, check each unit against the real files: what
one request is (dedupe by `requestId` across every file, merge its lines by maximum), what one
human turn is (`origin.kind`, `isMeta`, `isCompactSummary`), and which records a fork copied.
Survey the field values first (keys and counts only) and write the classifier to what is there.
