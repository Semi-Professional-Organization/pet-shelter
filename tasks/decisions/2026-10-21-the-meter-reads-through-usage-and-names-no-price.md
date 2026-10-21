# The meter reads transcripts through `usage`, and its lines name no price

**Decided:** 2026-10-21

## One reader

`scripts/agent/meter.mjs` reads a session's transcript by feeding its records to `usage`'s
`createExtractor` and taking the last request and the compactions from what it returns. Before, it
carried its own copy of that reader: request keys, merging a request's streamed lines, skipping
synthetic messages, compaction boundaries, the 5-minute and 1-hour write split. Rounds 1 to 3 of
the meter's review traced six findings to that copy disagreeing with `usage`, among them reading
across a compaction and pricing fast mode at standard rates. The rule for which cache lifetime
holds a context is now one function, `lifetimeHolding` in `usage.mjs`, that `coldResumes` and the
meter both call.

Measured before the change: the extractor gave the copy's reading at all 4,509 points replayed over
24 local transcripts (every 25th record, the last 600 records each). After it: the new reading
equals the old one at all 4,544 points of the same replay. Reading through the extractor costs
about 2 ms a call, against 340 ms for the hook.

## No price

The meter's lines say the context's size and what the level asks, and no dollar figure: the owner's
call on 2026-10-21, on the reasoning that the hand-off rule is in tokens, nothing showed the
dollars changing what an agent does, and pricing was where round 2's fast-mode bug came from. The
meter no longer reads the price table, the request's speed, region or service tier.

## What would reverse this

Evidence that a price in the line changes what agents do (kill condition 3 in
`tasks/open/agent-scripts-must-cut-what-a-session-costs.md` counts hand-offs, not prices). A price
would come back through `usage`'s `ratesFor`, never a second copy.

Plan: the "Context meter: root-cause plan" doc, root 1.
