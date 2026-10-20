# Production's Node version is documented, not observed

**Status:** ASSERTED · opened 2026-10-20

Until 2026-10-20, CI tested on Node 22 while production most likely ran 24. `package.json`
declares `"engines": { "node": ">=20.0.0" }`, an open range. Vercel's page "Supported Node.js
versions" lists 24.x (the default) and 22.x as available, says `engines` overrides the project
setting, and maps the open range `>=22.0.0` to the latest 24.x. By the same rule, `>=20.0.0`
resolves to 24.x. That is read from the documentation; no build log was seen.

CI now reads its version from `.nvmrc`, which says `24`. The developer machine this was found on
runs Node 26.4.0, a third major, so a local run can still disagree with both.

The open range carries a second risk: when Vercel adds a newer major, production moves to it on
the next deploy with no change in this repository, and CI stays where `.nvmrc` says.

**Settles when:** the owner reads the version from a production build (`node -v` in the build
command, or the version line in Vercel's build log), `.nvmrc` matches it, and `engines.node` is
pinned to that major (`"24.x"`) so that production cannot move without a commit. Pinning
`engines` changes what Vercel runs, so it is a deploy, not a CI tweak.
