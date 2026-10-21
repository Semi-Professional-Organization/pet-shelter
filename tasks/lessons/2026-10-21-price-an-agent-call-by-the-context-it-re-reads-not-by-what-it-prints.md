# Price an agent's call by the context it re-reads, not by what it prints

**Learned:** 2026-10-21

The first agent-scripts catalog ranked commands by the tokens their output put into context, and
promised that scripts would cut a third to a half of it. Priced at the official rates over this
repo's transcripts, cost split 58% re-reading cached context, 32% writing new context into the
cache and 10% output, and the scripts would save about 9%, not a third. Calls made above 400K were
58% of all cost; at Opus 5.5's cache-read rate, one call at 500K costs as much as ten at 50K,
whatever either prints. The meter's lines price a call this way (`priceOf` in
`scripts/agent/meter.mjs`), and the hand-off levels follow from it.

**Rule:** to compare two ways of doing agent work, multiply each call by the context it runs at
(cache-read rate times context size), add the new tokens it writes into the cache, and only then
look at output. A change that removes calls late in a big session beats one that trims output
early; a fresh start beats both once the context is large.
