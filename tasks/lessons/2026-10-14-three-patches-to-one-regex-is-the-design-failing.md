# Three patches to one regex is the design failing, not the regex needing a fourth

**Learned:** 2026-10-14

`tests/unit/homeAnchors.test.ts` needed comments removed from TSX source before scanning it. It got
a regex, and each review found the next way it was wrong:

1. Deleting `/* … */` shifted every reported line number, by 33 lines in one case.
2. Blanking from any whitespace-preceded `//` cut the `href` out of `<a title="Tue // Sun" href=…>`.
3. Restricting `//` to line starts still let a `/*` inside `accept="image/*"` open a comment that
   swallowed real code up to the next `*/`.

Each fix was correct about the case in front of it, and each was locally reasonable. The obvious
fourth — skip anything inside quotes — would have been the worst yet: JSX text is full of
apostrophes ("shelter's", "Don't"), and every one would open a string that never closes. It also
would not have caught the deeper error the parser found at once: inside JSX children `// <X />` is
not a comment at all, it renders, and a fixture had been asserting the opposite since the second
version.

`AGENTS.md` already says this: "Three *distinct* failed hypotheses kill the design, not the fourth
hypothesis." These were three distinct failures of one design — recognising a context-sensitive
grammar with a context-free pattern — and the response to each was a patch. The fix was to stop
writing a tokenizer: `typescript` was already a dependency, and #88 had used `ts.createSourceFile`
in a test weeks earlier.

**Rule:** when a hand-rolled parser fails a second time on a case its grammar was always going to
contain, stop patching and ask whether a real parser is already installed. Count distinct failures
of the *approach*, not of the line being edited. Then probe the replacement against the cases that
broke the old one — they are its specification.
