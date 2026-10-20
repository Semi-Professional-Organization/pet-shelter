# Content Editors paste a link to a report PDF rather than upload one

**Decided:** 2026-10-19

The transparency editor's Audit Reports tab offered "Upload PDF" to everyone who could open the
editor. It posts to `/api/upload`, which stores files only for `MANAGE_PET_MEDIA` holders (Super
Admins and Animal Managers). A Content Editor, the role the editor exists for, holds
`MANAGE_CONTENT` alone, so the button always answered "Unauthorized: Admin access required".

**Chosen:** the button is shown only to a member `/api/upload` accepts, computed on the server from
the verified session (`src/app/admin/transparency/page.tsx`). Everyone else sees "Your role cannot
upload files. Paste a link to the PDF, or ask a Super Admin to upload it."

**Not chosen:** letting `/api/upload` accept `MANAGE_CONTENT` for PDFs. That would make the button
work for the people it was built for, and may well be what the shelter wants, but it widens who can
put files on the shelter's public storage, which is the owner's call rather than a side effect of a
dead-end sweep. If the owner wants it: authorize `MANAGE_PET_MEDIA` or `MANAGE_CONTENT` in the
route, and after reading the form refuse a `MANAGE_CONTENT`-only member anything but
`application/pdf`; then drop the `canUploadFiles` prop.
