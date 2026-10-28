# Light blue is a fill, and blue text is the ink

**Decided:** 2026-10-28

The owner moved the brand from terracotta to light blue `#9bcfe5`. The terracotta `--primary`
worked in both directions — it hosted white text and read as text on cream — so ~100 call sites
used it as `text-primary`. Light blue cannot: it measures 1.61:1 on cream.

Offered two shapes; the owner chose the first:

1. **Light fill + deep ink (chosen).** `--primary` stays `#9bcfe5` and is a fill only, with navy
   `--primary-foreground: #0d2633` (9.28:1). Blue text is `--primary-ink: #1f6a8f` (5.28:1 on
   `--primary-panel`, 5.58:1 on `--work-ground`); every `text-primary` became `text-primary-ink`.
   Dark mode uses `#9bcfe5` for both, since it reads on a dark ground.
2. **One mid blue everywhere.** A single darker blue for buttons (white text) and text, with
   `#9bcfe5` only as pale tints. Smaller diff, but buttons would be darker than the owner's pick.

`designSystemGuards` enforces it: the contrast block measures `--primary-ink` on every ground it
sits on, and a new case fails any `text-primary` utility.

Reversing it means choosing (2) — re-pick `--primary`, then rename `text-primary-ink` back.
