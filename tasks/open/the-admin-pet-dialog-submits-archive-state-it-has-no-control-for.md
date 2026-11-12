# The admin pet dialog submits archive state and defaults it has no control for

**Status:** open · opened 2026-11-12 · found by `/code-review xhigh` on #212

`PetFormDialog` (`src/components/admin/PetFormDialog.tsx`) resolves an edit with the defaulted
`petFormSchema` and round-trips `isArchived` and `deletedAt` from the row it opened, although it
renders no control for either. Since #212 the server keeps a stored value for any key an edit
omits, but the dialog omits nothing, so that rule never protects its edits.

The case that bites: the table's row is stale for the session (`localPets` shadows the server, and
nothing calls `router.refresh()`). Another admin archives the animal; the first admin then edits
its description, the dialog submits `isArchived: false, deletedAt: null` from its old copy, and the
animal is un-archived and republished. Probed in review: a stale form on an archived row yields
that pair. The write is guarded on status only (the ceiling in `updateServerPet`, and
`admin-pet-writes-send-no-expected-status.md`).

A second, quieter hazard: because the resolver fills defaults, a defaulted key dropped from the
dialog's edit `reset()` would arrive as if submitted and reset the stored value.

Left out of #212, which named the merge copies and ruled out UI changes.

**Settles when:** the dialog stops sending `isArchived` and `deletedAt` on an edit and resolves
edits with `petEditSchema`, with a test that an edit from a stale row leaves an archived animal
archived.
