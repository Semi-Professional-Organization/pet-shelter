# Bulletin Malay text is stored and editable but never shown

**Status:** open · opened 2026-10-15 · read at `95679b7`

The bulletin editor at `/admin/bulletins` (#103) has Malay fields, and they are saved:
`titleMs` and `contentMs` on the `Bulletin` model in `prisma/schema.prisma`. Nothing reads them.
The public `Bulletin` type in `src/types/bulletin.ts` carries no Malay fields, and
`toBulletin` in `src/lib/server/bulletinRepository.ts` does no Malay resolution, so every notice
renders its English title and body on the Malay site — on `/`, `/pets` and `/bulletins` — even
when staff have written the Malay.

The feed's own labels (heading, category chip, "Pinned", "Posted by", the empty state) are Malay
since PR #104. The notices inside it are the part that stays English.

## Why this entry exists

#103 deliberately shipped the columns without the render side, and handed the render side to
`tasks/open/home-page-text-stays-english-on-the-malay-site.md`. PR #104 settled that entry, which
was about the home page's own copy, and deleted it. The deletion merged without a conflict, so
the render side was left with no owner and four pointers to a missing file. This entry takes over
that one row; the pointers now name it.

## The trap

Adding `titleMs` to `Bulletin` without also adding a `titleMs ?? title` fallback in `toBulletin`
ships a blank Malay title for every notice that has no translation. #103's decision,
`tasks/decisions/2026-09-22-bulletins-get-a-server-side-store.md`, records this, and `Faq`'s
`toFaqItem` is the shape to copy.

The feed is a Server Component and the reader's language is client state, so "pick the language"
cannot happen on the server without giving up static rendering of `/` and `/bulletins` — the same
constraint as `tasks/open/served-html-is-english-whatever-language-the-reader-chose.md`. The
likely shape is to pass both languages to the card and choose on the client, but that is not
decided here.

**Settles when:** a notice with Malay text shows that text on the Malay site and its English on the
English site; a notice without Malay text shows its English on both, never a blank title; and a
component test asserts all three.
