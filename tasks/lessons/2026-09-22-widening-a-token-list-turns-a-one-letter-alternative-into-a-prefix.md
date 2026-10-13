# Widening a token list turns a one-letter alternative into a prefix match

**Learned:** 2026-09-22

The birth-date backfill read an age with `(m|mo|month|bln|bulan)` and `(y|yr|year|thn|tahun)`,
unanchored. `"3 minggu"` — Malay for three *weeks* — matched the bare `m`, and a three-week-old
puppy was stored as three months old. The pre-check printed `ok: months`, so the operator had no
way to see it, and the follow-up file that drops `age` would have taken the evidence away.

The bare `m` and `y` had been harmless for as long as the file only claimed English. `"3 weeks"`
does not begin with m or y, so it was refused correctly. What broke it was adding `bulan` and
`tahun`: the moment the list admits another language, every one-letter alternative silently claims
every word in that language beginning with its letter. Adding `bulan` was safe. Leaving `m` beside
it was not, and the two changes look like one change.

Anchoring each alternative to a word boundary fixes it — `(bulan|bln|months|month|mths|mth|mos|mo|m)\M`,
longest first — and turns every unrecognised unit back into the refusal the file already promised
("anything else is not guessed at"). It costs `"2 yo"`, which is now refused rather than read as
two years, and that is the right trade for a one-shot backfill: refusing shows the operator a row,
guessing shows nobody anything.

Neither the rehearsal nor the first review caught it; the second review did. Every age fixture was
English or well-formed Malay, so the suite only ever asked about words the list was meant to match.

**Rule:** an alternation of unit or keyword tokens is anchored at both ends — digits on one side, a
word boundary on the other — before it is allowed near data you cannot re-derive. And when
extending such a list into a new language or domain, the test to write is not another accepted
token; it is a *rejected* word from the same language that starts with an existing short token.
That is the case the existing fixtures cannot contain, because they were written when the list was
narrower. Related: [[2026-09-22-a-regex-that-finds-a-number-beside-a-unit-does-not-find-the-number]].
