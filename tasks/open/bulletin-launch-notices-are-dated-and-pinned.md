# The launch notices the bulletin migration seeds are two months old, and two are pinned

**Status:** open · opened 2026-10-14 · a content decision for the shelter

`npm run db:migrate:bulletins` seeds `src/data/bulletins.json` into an empty `bulletins` table.
Those four notices are the same ones the public site has shown since before bulletins had a
server-side store, and as of 2026-10-14 they read:

| Date | Pinned | Title |
|---|---|---|
| 2026-08-14 | **yes** | Low-Cost Microchip & Vaccination Clinic **This Saturday** |
| 2026-08-12 | **yes** | **Urgent**: Temporary Foster Homes Needed in Petaling Jaya |
| 2026-08-10 | no | Update: Toby Settling into His New Home in Subang Jaya |
| 2026-08-05 | no | Adoption Promotion: Senior Rescue Pets Fee Fully Sponsored |

Pinned notices sort above everything else on the feeds they appear on, indefinitely. Where
each one appears depends on its target:

- the **clinic** notice targets every feed, so it leads the home page, the adoption directory
  (`/pets`) and the bulletins archive;
- the **urgent foster** appeal targets the home page, so it leads the home page and the archive
  but does not appear on `/pets`.

So once these are real rows, the home page leads with both — a clinic "this Saturday" and an
urgent appeal, both from August — until someone unpins or deletes them.

**This is not a regression.** Visitors see exactly these four today, from the old client-side
store. What changes is that they become editable — so the fix is now an edit in
`/admin/bulletins`, not a code change.

It is not changed in the code because the same file is the offline fallback, and what launch
content the shelter wants on its public pages is the shelter's call. Three reasonable answers:

- seed them as they are, then unpin or delete them in `/admin/bulletins` straight after;
- edit `src/data/bulletins.json` before running the migration (unpinned, unpublished, current
  dates, or removed);
- seed nothing, and let staff post the first real notices.

**Settles when:** the shelter has chosen one, and the feeds no longer lead with dated launch
content — or a decision entry records that they should.
