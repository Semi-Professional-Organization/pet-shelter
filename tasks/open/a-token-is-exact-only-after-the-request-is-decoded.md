# A signed token is exact only after the request has been decoded

**Status:** open · opened 2026-11-11

Found in review of #286. Since that fix, the session and notification codecs accept one string
per signed payload. But Next percent-decodes a cookie value or query parameter before the codec
sees it, so `hope_shelter_session=<payload>%2E<signature>` (the dot written as `%2E`, or any
other character as `%XX`) arrives as the issued token and is accepted. Probed with `NextRequest`
cookies and `URL.searchParams`.

No access is gained. It matters only to something that identifies a session by the raw request
text: an access log of the URL, a firewall rule, or a check on the `Cookie` header. Nothing in
`src/` does that today.

**Settles when:** token revocation or token-keyed logging is built and keys on the decoded token
(or on an id inside the payload), with a test that a percent-encoded copy of a revoked token is
refused.
