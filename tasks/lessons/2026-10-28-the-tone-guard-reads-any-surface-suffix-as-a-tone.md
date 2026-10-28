# The tone guard reads any `-surface` utility as a tone

**Learned:** 2026-10-28

A new brand token named `--primary-surface` made `bg-primary-surface` fail
"names only the seven tones and their seven slots" with "primary is not a tone": the guard parses
`<name>-<slot>` for every slot name (`surface`, `border`, `text`, `accent`, `solid`, …). It was
renamed `--primary-panel`. The sponsor standings hit the same wall and chose `-line` / `-label`.

**Rule:** a token outside the seven-tone contract must not end in a slot name. Pick a non-slot
suffix (`-panel`, `-ink`, `-line`, `-label`) before wiring it into components.
