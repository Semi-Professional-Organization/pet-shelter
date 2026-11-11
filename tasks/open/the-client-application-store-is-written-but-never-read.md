# The client application store is written but never read

**Status:** ASSERTED · opened 2026-11-11 · found by review while fixing #201, reasoned from a search

`useApplicationStore` is imported only by `useAdoptionFormController`, which uses only
`addApplication`. Nothing reads `applications` or its localStorage key, yet every submission
copies the applicant's email, phone, address and notes, plus the fixture applications, into the
browser's localStorage, on what may be a shared device.

**Settles when:** the store and its call are removed, or a reader is found that needs them and
the copy is limited to what that reader uses.
