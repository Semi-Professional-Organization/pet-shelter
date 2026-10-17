# Waiving a length minimum drops every control that quietly rode on it

**Learned:** 2026-10-17

**What happened:** The owner chose to let `STAFF_INVITE_SECRET` be any length. The change looked
like one rule: waive "shorter than 16" for that secret. Review then found, one round at a time,
values that had only ever been refused *because* they were short:

- the legacy invite codes `HOPE2026` and `1234`, which the app once accepted as credentials;
- the six seeded staff passwords (`admin123`…), 6-10 characters;
- quote-only values such as `""`, typed into a dashboard to mean "empty";
- the same published values wrapped in quotes.

Nobody had written those refusals down, because the minimum covered them for free. Each round
found the next one, and each fix needed its own test and mutant.

A second effect came with it: the operator-file guard filtered prose by length too. Once short
values booted, quoted words like "offboarding" counted as published codes that boot.

**Rule:** before waiving a minimum, ask what else it was refusing. List the values that are
short *and* known (published credentials, defaults, placeholders, empty-looking input), and
refuse them by name before the waiver runs. Treat every check that used length as a proxy
("long enough to be a real value") as broken by the change, and revisit it in the same commit.
