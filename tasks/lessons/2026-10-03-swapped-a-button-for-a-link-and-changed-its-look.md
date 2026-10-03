# Swapped a <Button> for a link and changed its look without being asked

**Learned:** 2026-10-03

Making the foster actions WhatsApp links, I styled the <a> with `buttonVariants({ className })`.
That concatenates without merging, while <Button> merges through `cn()`, so the conflicting size
and padding classes resolved differently and the button visibly changed. The trap was already
written down (page-style-guide §8.1) — by this same work, two days earlier.

**Rule:** when an element must become a link but keep a button's look, compose it exactly as
<Button> does — `cn(buttonVariants({ variant, size }), className)` — and compare its rendered
class set with the original before calling it done. A style change nobody asked for is a defect.
