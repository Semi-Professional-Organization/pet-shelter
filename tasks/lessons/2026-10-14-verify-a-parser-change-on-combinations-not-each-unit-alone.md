# Verify a parser change on combinations, not on each unit alone

**Learned:** 2026-10-14

PR #42 taught `approximateBirthDate` to read Malay units — `tahun`, `bulan` — and weeks. Before
merging it I checked every English spelling and every rollover case, old against new, and they
were unchanged. I also checked each Malay unit on its own: `2 tahun` now read as two years, and the
backfill refused it. Both sides correct, so I merged it, and then wrote a decision saying the
backfill "stores exactly what the app computes, or refuses".

A `medium` review disproved that in one probe. `1 tahun 6 months` is read by the app as **one
year** — it tries years first, and now recognises `tahun` — and by the backfill as **six months**:
the backfill does not read Malay, so it skips `tahun` and matches the English unit further along.
Different dates, no refusal, no error. Three of five mixed strings diverged.

Every unit was correct in isolation. The defect was in how two units in one string interact with
two different rules about which unit wins — and none of my inputs had two units in them. Before
#42 the app also skipped `tahun`, so both sides read the same English unit and agreed; the change
was safe for every string with one unit and unsafe for strings with two.

The general shape: **when two parsers disagree about which tokens they recognise, they also
disagree about which token they reach first**, and that second disagreement only shows up in a
string containing tokens from both vocabularies. A per-token check cannot find it, however
thorough.

**Rule:** when a change widens or narrows what a parser recognises, and anything else re-parses the
same input with a different vocabulary, test strings that combine a newly-recognised token with an
already-recognised one, in both orders — not just each token alone. If the two sides pick a token
by precedence ("years first"), a mixed string is the case that tests the precedence, and it is the
case most likely to be missing from a corpus built one unit at a time. Before calling two sides
"contained", measure a mixed string; containment is a claim about every input, and single-unit
inputs are not a sample of every input.
