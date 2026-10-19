# Review the commits a paused rebase already resolved, not just the conflict in front of you

**Learned:** 2026-10-20

Asked to finish a paused rebase, the obvious work was the commit it had stopped on. A range-diff
of the seven commits already resolved against their originals showed one had taken a side
wholesale: the impact commit, which added 13 lines to `/donate`, landed as 292, replacing master's
`DonatePageView` with the branch's old inline page and bringing back hard-coded figures and
ROS/LHDN badges. Nothing had failed; the commit message still described a 13-line change.

**Rule:** before continuing someone else's rebase, run
`git range-diff <upstream>..<orig-head-prefix> <onto>..HEAD` over the commits already done and
read every patch whose size changed a lot. A resolution that took one side wholesale passes
silently, and every later commit builds on it.
