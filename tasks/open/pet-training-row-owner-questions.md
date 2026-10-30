# The pet Training row leaves four questions for the owner

**Status:** open · opened 2026-10-30

The Training row (house, litter box and leash training on the pet page) shipped with these
undecided:

- **The admin form pre-fills "House-Trained"** on every new pet of any species
  (`src/components/admin/PetFormDialog.tsx`). The row turns that untouched default into a
  public green "House Trained" badge and 5 extra quiz points. Remove the default?
- **Training shows twice on the About tab:** the raw chip and the row. On the Malay page the
  chip stays English beside the Malay row. Hide training chips once the row shows them?
- **The gallery quick view** (`PetDetailDialog`) has the compatibility grid but no Training row.
- **The Malay labels** ("Latihan", "Terlatih Tandas", "Terlatih Guna Kotak Pasir", "Terlatih
  Berjalan Bertali") are ASSERTED, not checked by a native speaker.

**Settles when:** the owner answers each and the answers are built or declined.
