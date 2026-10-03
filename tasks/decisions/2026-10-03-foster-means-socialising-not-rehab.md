# Animals offered for foster are mainly shy or scared ones that need socialising — not rehab cases

**Decided:** 2026-10-03 · stated by the user (shelter knowledge), not inferred

Reverses the interim rule shipped in `757cc10`, which opened `In Rehabilitation` animals to foster.
That rule was inferred from placeholder copy (the old Get Involved "post-op recovery / medical
isolation / neonatal nursery" foster cards) and the "Foster-to-Adopt" FAQ, never checked with the
shelter. The user corrected it: animals available for foster are **mainly those who need to
socialise and warm up to people — the shy or scared ones**.

**Interim rule** (`getPlacementOptions`, until staff can set "open to: adopt | foster | both"):
an `Available` animal tagged **`Needs Socialising`** is open to foster (and not adopt); other
`Available` animals to adopt; `In Rehabilitation`, `Pending`, `Adopted` to neither — rehab cards
are back to "Sponsor Me". Status cannot express temperament, so a staff-set tag (already editable
in the admin pet form) is the only honest signal without a schema change.

**Not decided — ask the shelter:**
- Is an animal that needs socialising *only* for foster, or can it also be adopted? (Interim: foster only.)
- "Mainly" — does Foster-to-Adopt for rehab animals (faq-006, and the rehab profile's
  "Foster-to-Adopt & Care Inquiry" panel) still exist? Both are left untouched until answered.

No fixture animal carries the tag, so `/pets?type=foster` is empty until staff tag one.
