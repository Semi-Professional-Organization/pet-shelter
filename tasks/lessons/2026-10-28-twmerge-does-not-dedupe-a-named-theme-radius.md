# tailwind-merge does not see a named theme radius as a conflict

**Learned:** 2026-10-28

`Card` sets `rounded-card`. Passing `rounded-md` through `cn()` to flatten one card kept both
classes — `twMerge("rounded-card …", "rounded-md")` returned `rounded-card … rounded-md` — so which
radius wins depends on Tailwind's stylesheet order, not on the call site. It does dedupe
`bg-card` against `bg-primary-panel`; it is the named radius/shadow steps (`rounded-card`,
`shadow-brand-lg`) it does not recognise. `PetCard`'s old `rounded-3xl` override had the same
unknown outcome.

**Rule:** to change a design-system component's shape, change its named token
(`--radius-card`) or pass the same named class; never override a named step with a scale step
through `cn()`. Check with `node -e 'require("tailwind-merge").twMerge(a, b)'` before relying on it.
