# Inferred what "foster" means from placeholder copy, and shipped it as a rule

**Learned:** 2026-10-03

Building the adopt/foster filter, I decided which animals are "for foster" (those in
rehabilitation) from the old Get Involved foster cards and an FAQ — copy that had already been
shown to contain placeholders — and encoded it in code, tests and UI copy. The user corrected
it: foster animals are mainly shy or scared ones that need socialising. The commit had to be
partly reversed.

**Rule:** a domain rule about how the shelter operates (who can foster, what qualifies, who
decides) is a question for the user, not an inference from site copy — especially copy already
known to be placeholder. Ask before encoding it; if building before the answer, build the
mechanism with the rule isolated in one place and say plainly which part is a guess.
