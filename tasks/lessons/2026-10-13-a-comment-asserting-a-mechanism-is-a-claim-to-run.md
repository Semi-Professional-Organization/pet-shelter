# A comment asserting a mechanism is a claim you have to run

**Learned:** 2026-10-13

Four review rounds on one branch. The single defect shape that appeared in **every** round was not
a wrong line of code — it was a confident comment describing a mechanism nobody had executed.

- Round 1: the repository, the schema and the type all said the reader "resolves the English copy
  into any missing Malay field". It does not, and `Bulletin` has no Malay fields. The next person
  would have added `titleMs` to the interface, trusted the fallback, and shipped a blank title for
  every untranslated row.
- Round 2: a tiebreaker comment said it stopped a notice going missing from the feed. It was
  ascending, so it made that outcome *deterministic* instead of intermittent.
- Round 3: a comment said `readonly` kept a browser-shipped array from being mutated. `readonly`
  erases at compile time.
- Round 4: the same fix, having added `Object.freeze`, froze the list used for **message text** and
  left mutable the two that **decide** the check. And a comment described a data-corruption path —
  "saving would rewrite the row's category" — that `zodResolver` already makes unreachable.

Round 4 also found the round-3 fix for round 2 still broken: `createdAt` was restored to a full
instant, but every fixture row was stamped with the same epoch, so the tiebreaker stayed dead on
the one path that ran it. Three commits in a row claimed to fix one ordering rule; none did, and
each said it had.

**Why the comments are the risk and not a side issue.** Code that is wrong gets caught by a test
or a reviewer reading the code. A comment that is wrong gets *believed* — it is the thing a future
reader consults instead of re-deriving, so it converts one person's unverified belief into the
spec. `tasks/lessons/2026-09-22-fixing-one-readers-policy-turns-its-neighbours-comments-into-the-spec.md`
is the same observation from the other end.

**Rule.** Before writing a comment that asserts a mechanism — "this prevents X", "without this Y
happens", "the type makes Z impossible" — run the assertion. Specifically:

- "this prevents X" → mutate the line out and watch a test fail. If none does, the comment is the
  only thing preventing X, which is to say nothing is.
- "the type makes Z impossible" → write the assignment the type should reject and compile it. A
  predicate narrowing a value to `never` makes the branch unreachable and *every* edit to it
  typecheck identically; the reviewer caught exactly that with four lines of `tsc`.
- "`readonly` / `as const` protects this at runtime" → it does not. `Object.freeze` does, and only
  on the object you actually pass it.
- "without this the editor would see Y" → open the form. A `<select>` with no matching `<option>`
  shows blank (`selectedIndex = -1`), not the first option.

The cheap version of all four: if a comment names a consequence, the next line of work is the
command that demonstrates it, not the next paragraph. **Prose is not evidence, including — and
especially — prose written while fixing something.**
