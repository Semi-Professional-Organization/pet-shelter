# The last request before a compaction measures the context it replaced

**Learned:** 2026-10-21

The context meter read "the session's size" as the last `assistant` request in its transcript.
Claude Code writes no request for a compaction: three real auto-compactions here end with a
966K request, then a `compact_boundary` (`preTokens` 967K, `postTokens` 9K to 22K) and the
summary, and nothing measured the new context until the next request. So a message arriving after
idle compaction would have been told it re-wrote 480K and should hand off, when it was about to
write 20K. The first review of the meter missed it; the second found it from the format, not from
a failing case.

**Rule:** when "the current state" is read from the tail of an append-only log, list the records
that end what the latest entry describes (here `compact_boundary`) and stop at them; a reading
from before one is not a reading at all. Check the real files for such records before writing
the reader.
