# Bulletin bylines publish each editor's own name, and there is no way to post as a team

**Status:** open · opened 2026-10-14 · a product decision, not a defect

A notice posted through `/admin/bulletins` is signed with the posting editor's display name,
taken from their verified session. That was deliberate: a free-text byline would let any
content editor publish under a colleague's name. The byline cannot be edited afterwards, so
correcting a typo does not reassign it either.

Two consequences the shelter should decide on, rather than inherit:

1. **Every post puts an editor's personal name on three public, cached, crawlable pages** — `/`,
   `/pets` and `/bulletins`. Whether that is acceptable for volunteers and staff is a policy
   question for the shelter, not something the code should settle silently.
2. **There is no way to post as a team.** The launch notices are signed "Veterinary Team",
   "Foster Coordinator" and so on, and staff will reasonably want to do the same. The current
   form cannot.

What is already handled: a member with no display name is signed "Shelter Team", never with an
email address. An earlier revision fell back to the email, which would have published it.

The likely shape of a fix, if wanted, is a fixed list of team bylines the editor chooses from,
plus "my name" — a closed vocabulary keeps the impersonation protection while allowing team
signatures. That is a form field, an enum or a lookup, and a decision about who may use which
team name.

**Settles when:** the shelter decides whether bylines show personal names, and either the form
offers team bylines or a decision entry records that personal names are intended.
