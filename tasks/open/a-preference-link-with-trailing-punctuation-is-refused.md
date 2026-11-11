# A notification preference link with trailing punctuation is refused

**Status:** open · opened 2026-11-11

Found in review of #286. The "manage your notifications" link ends in its token, so the
signature is the last thing in the URL. Before #286 the signature check ignored anything after
the last valid hex character, so a link that picked up a trailing `)`, `>`, `,` or space (a chat
app or mail client treating the punctuation as part of the URL, or a careless paste) still
worked. #286 made the check exact on purpose, so that link now shows "This preference link is not
valid". The links live for a year and are sent bare in the plain-text part of the email.

The one-click unsubscribe link is not affected, because `&list=...` follows its token.

Not fixed in #286: trimming the token where the link is read would bring back, for this one token
type, the "several strings, one token" behaviour that fix removes. These tokens have no
revocation list, so that may be an acceptable trade here. It is the owner's call.

**Settles when:** the owner decides whether the preferences page strips trailing punctuation and
whitespace from its token before `getNotificationPreferencesAction` and
`updateNotificationPreferencesAction` (`src/actions/notifications.ts`) verify it, with a test at
those actions either way. The unsubscribe route needs no change.
