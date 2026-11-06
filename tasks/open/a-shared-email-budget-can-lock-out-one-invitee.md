# A shared email budget lets anyone keep one invitee from registering

**Status:** open · opened 2026-11-05

Found in review of #213. The `register:email:` budget (5 a minute) is now held in Postgres and
counts every attempt, whatever invite code it carries. Someone who knows an invited person's email
can spend those 5 tries every minute with junk codes and keep that email refused on every server
instance, while their own address budget (10 a minute) is never exhausted. Before #213 the same was
possible on one instance only.

The address budget has the same shape: everyone behind one shared public address (an office NAT,
a carrier's CGNAT) shares one 10-a-minute budget on every instance, so one person on that network
can keep the others from registering.

For a shelter this is a nuisance, not a breach: the administrator can invite the person through the
member screens instead, which do not use this budget. Options if it matters: count only attempts
whose invite code matched, or drop the email budget now that the address budget is shared.

**Settles when:** the email budget stops counting failed invite codes, or a decision entry records
that the nuisance is acceptable.
