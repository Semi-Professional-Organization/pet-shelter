# A hidden browser pane does not paint, so force a frame before measuring the page

**Learned:** 2026-10-20

During the UI audit a subagent measured pages in the desktop app's built-in browser while the
pane was hidden behind another panel. `requestAnimationFrame` never fired, which it verified, so
React Suspense reveals (`div#S:0`) stayed pending. Its first reading of `/pets/pet-001` reported a
duplicate h1 and duplicate tab IDs that were not on the rendered page. Taking a screenshot forced a
frame, and the duplicates disappeared.

**Rule:** before measuring DOM, layout or headings in the built-in browser, force two frames (a
screenshot each) or confirm that `requestAnimationFrame` fires. Treat any reading taken without
that as unverified.
