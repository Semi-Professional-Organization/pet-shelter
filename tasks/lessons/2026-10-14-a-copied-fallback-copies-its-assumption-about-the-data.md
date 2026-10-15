# A copied fallback copies its assumption about the data

**Learned:** 2026-10-14

The bulletin repository was modelled on the FAQ one, deliberately — matching the house shape is
the right default and AGENTS.md's ladder says reuse before inventing. The fallback came along with
it: when the database read throws, serve the committed JSON fixture. For FAQ that is the settled,
tested, repo-wide position.

It was wrong for bulletins, and four review rounds did not notice, because the code was correct.
The defect was in what the code *assumed about the fixture*.

- **The FAQ fixture is content that stays true.** "How much does adoption cost" has the same
  answer next month. Serving it during an outage serves something close to right.
- **The bulletin fixture is content that goes stale on purpose.** It is four launch notices — a
  clinic "this Saturday", an urgent foster appeal. Staff will edit and delete them. Serving that
  fixture during an outage brings back notices staff *deleted* and hides everything they
  *posted*. And because `/` and `/bulletins` are ISR, a render taken during a database blip is
  cached as the good page for five minutes.

Add one fact that made it worse: in production `handlePersistenceError` swallows a read failure
without logging, so nobody would have known.

The fix keeps the fixture where it is still the truth — a deploy that lands before the migration,
where the table does not exist and the fixture *is* the launch content — and otherwise serves no
notices and logs. An empty feed asserts nothing false.

**Rule.** When adopting a repository template, the code is the cheap part to check. Ask what its
fallback *serves*, and whether that is still true for the new type:

- Is the fixture content that stays true (a catalogue, a policy), or content staff will change
  and retract (notices, prices, statuses)?
- Is the page that renders it cached? A fallback on a dynamic page is a bad few seconds; on an
  ISR page it is the page, for the whole revalidation window.
- Does the failure path log in production? If not, a wrong fallback is invisible as well as wrong.

A precedent tells you what was right for the data it was written for. It does not know your data.
