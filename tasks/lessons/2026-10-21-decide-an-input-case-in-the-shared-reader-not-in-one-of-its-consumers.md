# Decide an input case in the shared reader, not in one of its consumers

**Learned:** 2026-10-21

The context meter's root-cause pass made the meter read transcripts through `usage`'s extractor, so
one reader would decide what a transcript means. The first review then found an input case the old
copy had handled: an assistant line with no usage, which the extractor reads as a request of 0
tokens. The fix round changed the extractor and moved `usage`'s own report; the next round undid
that and guarded the meter alone ("the last request that sent a prompt"); the round after found
that guard disagreeing with `usage`'s `segmentBreaks`, which reads the same 0-token request as a
compaction. Three rounds went to one case that occurs in none of 25,798 lines, and the middle one
rebuilt the two readers the pass existed to remove.

**Rule:** when a finding is about what an input means, settle it once, in the reader every
consumer shares: either a fix there that all of them get, or a measured `ceiling:` there. A guard
in one consumer is a second reader. If the case has never been seen, the measured ceiling is
usually the answer.
