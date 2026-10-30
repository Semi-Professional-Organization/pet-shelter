# The pet Training row leaves three questions for the owner

**Status:** open · opened 2026-10-30

The Training row (house, litter box and leash training on the pet page) shipped with these
undecided. (The admin form does not pre-fill "House-Trained" on new pets: create mode resets the
tags to "Vaccinated" and "Friendly", so no default becomes a badge.)

- **Training shows twice on the About tab:** the raw chip and the row. On the Malay page the
  chip stays English beside the Malay row. Hide training chips once the row shows them?
- **The gallery quick view** (`PetDetailDialog`) has the compatibility grid but no Training row.
- **The Malay labels** ("Latihan", "Terlatih Tandas", "Terlatih Guna Kotak Pasir", "Terlatih
  Berjalan Bertali") are ASSERTED, not checked by a native speaker.

**Settles when:** the owner answers each and the answers are built or declined.
