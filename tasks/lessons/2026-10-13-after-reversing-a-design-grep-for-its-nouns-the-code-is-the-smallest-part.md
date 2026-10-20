# After reversing a design, grep for its nouns; the code is the smallest part of what described it

**Learned:** 2026-10-13

Commit `b40a7d7` reversed two choices in the birth-date migration: Malay age words went from
translated to refused, and month-end dates from clamped to rolled forward. The SQL and the
rehearsal fixtures were changed and every check passed.

The header was changed where the author was looking. A review then found three places still
describing the old design, one of them telling the owner that `"3 tahun (lahir 12/06/2023)"`
"backfills normally" when it now aborts the transaction. Fixing those three, a grep for `tahun`,
`bulan`, `clamp` and `month end` found five more the review had not listed: the "After" section
still said rolled rows were "clamped" and were "not what the app's own arithmetic would have
produced", which had become the opposite of true; `"2 bulan setengah"` was still said to be
taken as two months; two refusal fixtures were cited in spellings the script no longer
contained; and the rehearsal still titled its rollover section "clamping". The same review also
found the header sending the reader to a check list in a decision entry that was six checks and
three groups behind the script.

None of it could fail a test. A header is read by the person about to paste the file into
production, and it was the only part of the change with no check on it.

**Rule:** a reversal is finished when a search for the old design's vocabulary returns only
history. Run that search over the file's own comments, its sibling files and the ledger before
calling the reversal done, and treat each hit as either a dated record or a defect. Where prose
restates something executable (a check list, a count, a fixture), replace the restatement with a
pointer to the thing that runs.
