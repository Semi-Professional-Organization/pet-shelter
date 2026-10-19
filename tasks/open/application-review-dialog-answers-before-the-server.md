# The application review dialog answers before the server does

**Status:** ASSERTED · opened 2026-10-19 · read from the code during the role dead-end sweep, not
reproduced against a database

The sweep made decisions on real applications reach the server: the board used to check the
browser's sample store first and stop at "Application not found" for every one of them. These two
were seen alongside and left, because neither changes who may do what.

## 1. "Save Decision" reports success before the server has answered

`ApplicationDetailDialog` shows "Application review saved successfully!" and closes as soon as the
board applies the change on screen. The server's answer arrives afterwards; a refusal rolls the
row back and appears in the board's banner, after the dialog has said it worked.

## 2. Scheduling a meet and greet reopens a decided application

After a successful `scheduleApplicationInterview`, the dialog saves the status `UNDER_REVIEW` a
second time, though the server action keeps the existing status on purpose. An approved or
rejected application can be reopened this way, and a second status email goes out. The success
text says an email was sent even when the box was unticked.

**Settles when:** each section is fixed or moved to `tasks/decisions/` as a deliberate non-fix.
