# A swallowed refusal over a fixture fallback reads as a working screen

**Learned:** 2026-10-19

`/admin/pets` and `/admin/applications` had no page gate. Each called a guarded read inside
`try { … } catch { data = undefined }`, and the client table fell back to the browser store, which
starts from the bundled demo data. So a role the read refused saw "Adoptable Animals Inventory"
with ten demo animals, or the applications board with three sample applicants, every control
live, and no denial anywhere until a save was rolled back. The comment on the catch said the client
shell would redirect to sign-in; the shell only redirected when nobody at all was signed in.

**Rule:** a page whose data load can refuse must decide access before it renders, and a `catch`
around an authorized read must never fall through to fixture data — a refusal and an empty result
are different answers and the screen has to say which it got.
