# The home page still carries terracotta neutrals under the blue accent

**Status:** open · opened 2026-10-28

The 2026-10-28 pass moved the accent, the focus ring, the control hover washes, the brand shadows
and the scrollbar to blue (`tasks/decisions/2026-10-28-light-blue-is-a-fill-and-blue-text-is-the-ink.md`).
It deliberately left the neutrals, which still come from the old paw-logo palette. Seen in a
1280px screenshot of `/` that day:

- Pet-card trait chips are peach/pink (`--secondary` / `--accent`).
- Hairlines are pink (`--border: #ecd7d0`) — the standards list rules, the steps rail.
- Body copy under headings is rosewood (`--muted-foreground: #6b4c4a`).
- The footer is a grey band (`--frame*`), not the cream `--work-ground`.
- The navbar is a solid `bg-primary/95` bar from the owner's WIP; the references the owner chose
  keep the bar on the ground and use the accent only for the active link. Not changed — it was
  the owner's pick — but its `text-muted-foreground` links measure about 4.5:1 on it, at the edge.
- The bulletin `grid` and `lead` layouts (`/bulletins`) still use `rounded-3xl border` media;
  only the home `carousel` layout was flattened.

**Settles when:** the owner decides whether the neutrals go cool/neutral to match the blue, and
each item above is either retinted or kept on purpose.
