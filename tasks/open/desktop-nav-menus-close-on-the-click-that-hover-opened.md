# Desktop nav menus close on the click that the hover just opened

**Status:** open · opened 2026-10-14 · read at `4744020`

The navbar's two desktop dropdowns, Adoption and Get Involved, open in two ways at once. Their
wrapper sets the menu open on `onMouseEnter` (`src/components/layout/Navbar.tsx`, the Adoption and
Get Involved dropdown blocks), and their button **toggles** it on `onClick`:
`prev === "get-involved" ? null : "get-involved"`.

A mouse has to enter the button before it can click it. So a desktop visitor who clicks a menu
button, which is what a button invites, opens the menu by hovering and then closes it by clicking.
The menu flashes, or never seems to open. A touch device at the `lg` breakpoint that sends
compatibility mouse events (a tablet in Chrome) fires `mouseenter` and then `click` from one tap,
with the same result.

**Observed, not inferred:** `@testing-library/user-event`'s `click` sends the same hover-then-click
sequence, and a test that clicked the Get Involved button found the menu closed afterwards. That
test now hovers instead, and says why — `tests/components/navbar.test.tsx`. Not yet seen in a real
browser.

**Why it was not fixed in the branch that found it:** that branch (PR #104) fixed three home-page
defects. Changing how the site-wide menus open is a behaviour change for every page, and keyboard
users currently rely on the click toggle: Enter or Space opens and closes the menu with no hover.
A fix has to keep that.

**Settles when:** clicking a desktop menu button leaves the menu open whether or not the pointer
hovered first, keyboard Enter/Space still opens and closes it, and a component test clicks — not
hovers — to prove the first. One shape that fits: ignore the click's toggle-closed when the open
came from `mouseenter` in the same gesture, or drop hover-to-open and open on click alone.
