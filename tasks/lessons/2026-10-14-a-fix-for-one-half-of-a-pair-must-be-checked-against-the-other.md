# A fix for one half of a pair must be checked against the other half

**Learned:** 2026-10-14

PR #104's late review rounds kept finding the same thing. Round seven: the footer half of the shared
`nav.sponsorWall` key was tested and the navbar half was not. Round eight: the new navbar test
compared against a Malay literal, so drifted English passed. It was rewritten to check both
languages against the dictionary, and the footer test it was modelled on, which had the identical
gap, was left as it was. Round nine found that. The same round found that a ledger table of
navbar/footer label drift listed three links out of five. Each fix was correct for the case in front
of it and stopped there.

**Rule:** when a fix or a test is about one member of a pair, such as navbar/footer, en/ms,
desktop/mobile, or a function and its twin, then before committing, apply the same check to every
other member and say in the commit which members were checked. An inventory is built by enumerating
the set (each `href` both components link) and not by remembering examples, and the entry says
which of the two it was.
