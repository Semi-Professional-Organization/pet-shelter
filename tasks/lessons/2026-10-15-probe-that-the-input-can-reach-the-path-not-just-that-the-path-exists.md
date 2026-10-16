# Probe that the input can reach the path, not just that the path exists

**Learned:** 2026-10-15

A review of PR #119 said `approximateBirthDate`'s old `RangeError` was caught by the pet
repository as a database outage, which silently swapped the catalogue for the demo pets. The check
made before accepting it was the shape: `mapDbPetToPet` does run inside the same `try` as the
Prisma query, so a throw from it would go there. The comments, the decision, the stream, and a
new open entry (which mirrors to a public GitHub issue) were all rewritten to say so.

The next review showed that no input could take that path. The Prisma `Pet` model has no `age`
field, so a database read never hands the mapper an age, even though production's table still
has the column. The entry was deleted before it reached master.

The correction then made the same mistake one step further on. It said the throw, reachable only
from a browser's `localStorage` copy inside `usePetStore`'s `try`, made that browser lose its
saved pets. A third review rendered the hook: the store's mount effect puts the saved pets back
a render later. So the catch site was right and what happened after it was not.

**Rule:** a claim of the form "this throw leads to that outcome" needs three probes, not one:
that the handler wraps the call, that some real input reaches the throw (trace it back to its
source: the schema the code reads, the form, storage), and what the code does after the catch,
through to what the user sees. If that last step is not probed, write "reasoned, not traced" or
leave the consequence out. A shorter claim that is true beats a vivid one that is not, and above
all in anything public.
