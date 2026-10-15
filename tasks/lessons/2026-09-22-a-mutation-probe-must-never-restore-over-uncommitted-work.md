# A mutation probe must never restore over uncommitted work

**Learned:** 2026-09-22

The repo's own standard is that a test is trusted only once a mutant has failed it
(`tasks/lessons/2026-09-16-characterization-tests-discriminate-against-mutants.md`). The obvious
way to automate that is a script that mutates one file, runs the test, and restores. The restore
is the trap:

    restore() { git checkout -- "$VAL" "$MED" "$REPO"; }
    trap restore EXIT INT TERM

`git checkout --` restores from the index, not from a memory of what was there a moment ago. Run
against files holding **uncommitted** work, the first restore does not undo the mutation — it
throws away the edits too. Ten review fixes across three files disappeared in one call.

The failure then hides itself, which is the part worth remembering. The probe kept printing
`KILLED` for every remaining mutant, because a test written against a fix that is no longer in the
tree fails whether or not the mutation is present. **Three of the four results were meaningless and
all four looked identical.** Nothing errored. The loss was visible only in `git status`, where
three files that should have been modified were not.

Two rules, and the first is the one that matters:

**Commit before you probe.** The probe is a check on committed work, not a stage of writing it.
With the fixes committed, `git checkout --` restores exactly the state under test, the mutants are
applied to real code, and the results mean what they say. Re-run after committing: same four
mutants, same four `KILLED`, this time earned.

**A probe harness needs its own assertion.** The script ended with
`git diff --stat` to prove the tree was clean afterwards — which it dutifully reported, because a
tree that has lost its changes is also clean. The check should be that the diff is *unchanged from
before the run*, captured up front and compared, not that it is empty.

Related: this is the same shape as
`tasks/lessons/2026-09-14-a-missing-docker-is-not-a-missing-database-tier.md` — a result that looks
like evidence, arrived at by a route that could not have produced evidence. There the rung was
priced as missing; here the mutants were priced as killed. Both read fine until someone asked how
the answer was obtained.
