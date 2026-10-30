# The pet page's Training row shows only training a tag records

**Decided:** 2026-10-30

The Training row on the pet detail page lists house, litter box and leash training only when a
tag records it, and renders nothing otherwise. It never says "No": a missing tag means nobody
recorded it, not that the animal is untrained. Tags match on a key that ignores case, spaces,
underscores and dashes; qualified or combined tags ("Mostly house-trained",
"House-Trained, Leash Trained") match nothing rather than being guessed at.

The match quiz uses the same matcher, which narrows its old substring test
`/house-trained/i`: "Not House-Trained" no longer earns beginner points, and neither does
"Mostly house-trained".

The custom `HouseCheck` icon means house trained only. The adoption home check or home visit
needs an icon of its own.

Reverse if the owner wants a three-state field (yes / no / unknown); that needs structured data,
see `open/free-text-pet-tags-are-matched-two-different-ways.md`.
