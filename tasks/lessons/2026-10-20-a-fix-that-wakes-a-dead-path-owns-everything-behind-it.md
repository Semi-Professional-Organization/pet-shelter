# A fix that wakes a dead path owns everything behind it

**Learned:** 2026-10-20

The applications board checked the browser's sample store before calling the server, so no
decision on a real application had ever reached `updateApplicationStatus` or
`scheduleApplicationInterview`. The role dead-end branch removed that check in its sixth review
round, because the controls it now offered reviewers could not work without it. The seventh round
and one more review pass then found three defects that had sat behind the dead call for as long
as it was dead: the dialog said "saved" before the server answered; every meet and greet was
followed by a second status write that replaced its notes, sent a second email and reopened
approved applications; and re-saving an approved application re-ran the approval, re-adopting an
animal returned since and rejecting its new applicants. None was new code. All three became
reachable in one commit, and each cost a fix round of its own.

**Rule:** before a change makes an unreachable call reachable, list what that call now reaches
(the actions, the repository writes and their cascades, the emails) and review that path in the
same commit, or leave the call dead and file it. Count the woken path as part of the change's
scope when stating the scope, not as a surprise in a later round.
