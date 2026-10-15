# A summary of review rounds is a claim; tally them before stopping on it

**Learned:** 2026-10-15

PR #104's review loop was stopped on the sentence "rounds ten, eleven and twelve each found only
wording, never code". Round thirteen showed round ten had found false facts. The correction said
"only rounds eleven and twelve were wording-only", and round fourteen showed round twelve's findings
were the same kind. A third version tallied the rounds in a table, still with a "fact" or "wording"
label on each row, and round fifteen showed two rows of the same shape labelled differently. Once the labels were removed, what
could be counted was that every round from ten to fifteen found an inaccuracy in the previous fix.

**Rule:** before stopping a review loop, or writing any sentence that characterises several rounds
at once ("only nits", "never code", "all fixed"), list each round's findings and dispositions from the
record, and state only what that list lets you count. Do not label findings by severity or kind to
reach a conclusion; that label is where the judgment hides. A ledger fix is not exempt from review
because it is prose: here, prose fixes were where the new inaccuracies kept appearing.
