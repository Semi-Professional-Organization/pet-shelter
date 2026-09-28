# Today — 23 Sep 2026 (evening 1 of 5, ~2h)

`tasks/today.md` went missing earlier today; this is a rewrite. Full plan: `tasks/ui-checklist.md`.

## Done

- [x] Commit the finished src work — 4 commits, `343fa79`..`afadf53`

## 1. The hero blocker — 30 min

`Hero.tsx` is still uncommitted. It needs `public/cutouts/*.png`, which `.gitignore` line 59
(`*.png`) excludes, so the hero is broken on a fresh clone and on any deploy.

- [ ] Decide: `git add -f` the cut-outs, or narrow the `*.png` rule so `public/` is tracked
- [ ] Confirm the placeholder cut-outs are ours to ship
- [ ] Commit the images and `Hero.tsx` in one commit
- [ ] Verify on a fresh clone (`git clone . /tmp/clone-check`) that the hero has its images

## 2. Look at the home page — 20 min

Nothing from 16 Sep has been seen in a browser. `npm run dev`, then:

- [ ] Desktop light, dark, 400px, Malay
- [ ] Note anything broken under "Found while checking"; fix only what is glaring

## 3. Featured animals grid — 20 min

- [ ] 1, 2 and 3 pets — the row should not stretch or leave a gap
- [ ] 400px: cards stack, buttons readable, badges clear of the photo corners

## 4. Malay for the new home strings — 20 min

- [ ] `app/page.tsx`: Adoptable Animals title and subtitle
- [ ] `BulletinFeed` "From the shelter" title and subtitle
- [ ] Neither wraps badly at 400px in Malay

## 5. Spare — 30 min

For whatever step 2 turns up. If nothing does, start evening 2: `needs` hero ground and h1.

---

Stop at 2h. Anything open moves to evening 2 — expected, not a slip.

## Found while checking

(write here)
