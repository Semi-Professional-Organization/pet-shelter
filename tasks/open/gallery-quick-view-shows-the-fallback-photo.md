# The gallery quick view shows the fallback photo instead of the pet's own

**Status:** ASSERTED · opened 2026-10-30

`PetDetailDialog` sets `imgSrc` once with `useState(pet?.image || FALLBACK_PET_IMAGE)`, while
the gallery mounts it with `pet` still null, so `imgSrc` stays the fallback for the whole mount
and every pet opened in the quick view shows the same stock photo. Found by code review of the
pet training icons branch, not reproduced in a browser.

**Settles when:** the dialog is keyed by pet id or re-syncs `imgSrc` when `pet.image` changes,
and a test opens two pets in turn.
