# A harness you cannot run is not a change you cannot verify

**Learned:** 2026-10-14

The expand migration stored some mixed-language ages silently wrong. The fix was a refusal clause in
its SQL. I declined to make it — twice, in two documents — on the grounds that the migration's own
92-check harness needs `embedded-postgres`, which was not installed, and that its J1 check asserts
the header's pre-check query agrees with the file, so a new refusal had to land in both and could
not be verified. Instead I pinned the defect as a passing "known defect" check and wrote it up.

A review pointed out that the reasoning did not hold. I did not need the whole harness; I needed the
checks the change could affect. Reading them took two greps: J1 and J3 were the only checks touching
the pre-check, and L1 and O3 the only ones using the affected units. J1's extraction is twenty lines
of string slicing; its fixtures and assertions are a literal table. I reproduced J1 and J3 in the
harness I *could* run, added the new cases, and then mutated the fix — removing the clause from the
pre-check but not the file — to confirm the reproduction caught exactly the drift I had been afraid
of. It did, naming each case. The fix went in, verified, the same hour.

"I can't run X" had become "I can't verify this", and the second does not follow from the first. It
also produced the worst available outcome: a known production-data defect pinned green in a harness,
which is a guard reporting success over a bug.

**Rule:** when a change is blocked on "the suite that covers this can't run here", list the specific
checks the change can affect before deciding. If they are few and their assertions are legible,
reproduce them where you can run them, add the new cases, and mutate the change once to prove the
reproduction would have caught the failure you were worried about. Say in the record which checks
were reproduced and which were not. Reserve "cannot verify" for when that list is long or the checks
are not reproducible — and when it genuinely is, do not pin the defect as passing; leave it failing
or leave it out.
