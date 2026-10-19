# Node versions differ between development, CI and production

**Status:** ASSERTED · opened 2026-10-20

CI tests on Node 22 (`NODE_VERSION` in `.github/workflows/ci.yml`). The developer machine this was
found on runs Node 26.4.0. Production's version is not visible from the repository:
`package.json` declares `"engines": { "node": ">=20.0.0" }`, an open range, and Vercel's
documentation describes using the newest version it supports within the range. So production
probably runs a third version. That part is reasoned, not observed.

Why it matters: a behaviour that differs between Node majors passes CI and fails only in
production, or the reverse, and a local run on a third major can disagree with both.

**Settles when:** the owner reads the Node.js version Vercel uses (Project Settings → Build and
Deployment → Node.js Version, or the version line in a production build log), and one major is
pinned to match in both `engines.node` and `ci.yml`. Pinning `engines` changes what Vercel runs,
so it is a deploy, not a CI tweak.
