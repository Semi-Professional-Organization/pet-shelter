# Content Editors upload audit-report PDFs

**Decided:** 2026-10-20

Reverses `2026-10-19-content-editors-paste-report-links-rather-than-upload.md`, which hid
"Upload PDF" from Content Editors and left widening `/api/upload` to the owner. The owner chose
to widen it.

`/api/upload` (POST) now accepts a MANAGE_CONTENT holder as well as a MANAGE_PET_MEDIA one, but
takes only `application/pdf` from a member without MANAGE_PET_MEDIA; anything else gets a 403
"Your role can upload PDF reports only." Pet photos stay with pet media, and deleting files
(DELETE) still needs MANAGE_PET_MEDIA. Every member the transparency page admits holds
MANAGE_CONTENT, so the editor offers the upload to all of them and the "Your role cannot upload
files" hint is gone.

**Reversing it:** gate POST on MANAGE_PET_MEDIA alone again and restore the editor's
`canUploadFiles` flag (`tests/unit/uploadContentEditorPdf.test.ts` pins the current rule).
