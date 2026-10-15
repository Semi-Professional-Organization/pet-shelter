# Home page copy is duplicated outside the dictionary, and half the dictionary has no reader

**Status:** open · opened 2026-09-22 · counted at `b90304d`

`src/lib/i18n/translations.ts` is not the source of the home page's copy. Most sections inline
`isMs ? "…" : "…"` ternaries, and for several of them a fully translated key already exists and is
read by nothing. The two copies then drift, silently, because nothing compares them.

## Where it stands after 2026-09-22

`tasks/decisions/2026-09-22-home-anchors-remount-the-process-section-and-repoint-support.md` fixed
one instance — `HomeProcessSection`'s steps, which had to be settled because remounting the section
meant republishing its copy — and deleted eight keys orphaned by removing `HomeCommunitySection`.
It did not fix the rest, and picking one instance out of several is why this entry exists rather
than a claim that the problem is handled.

**Still duplicated and already diverged.** `HomeStandardsSection` (`HomeSections.tsx`), the function
immediately below the one that was fixed, inlines copy that `home.protocol1Title`…`protocol4Desc`
already hold in both locales, and they disagree:

| Key | Dictionary (ms) | Rendered (ms) |
|---|---|---|
| `protocol2Title` | "Polisi Adopsi 100% Percuma" | "Polisi Adopsi Percuma 100%" |
| `protocol3Title` | "Bimbingan & Jaminan Sepanjang Hayat" | "Bimbingan & Jaring Keselamatan" |

`protocol1Desc` differs by a whole clause. A translator editing any of these changes nothing on
screen.

**Duplicated across components.** `Navbar.tsx`'s brand tagline renders the hero's `<h1>` English
verbatim — "Coexistence through TNRM & Education" — while its Malay is a shortened form. Shortening
the English to match was tried on 2026-09-22 and reverted: it drops "& Education", one of the three
pillars `HomeOurWorkSection` names, which is a content decision and not a deduplication. Since
2026-10-14 the hero's copy is a dictionary key, `hero.tnrmHeadline`; the navbar's tagline is still
inline, so the two English strings remain identical by coincidence rather than by source.

**The navbar and the footer label the same links differently.** The footer reads `nav.*` keys; the
navbar mostly inlines its own pairs. Measured on 2026-10-14 by listing every `href` literal in
`Navbar.tsx` and `Footer.tsx` with `grep` and intersecting the two lists: they share **seven**.
Two match, because the navbar reads the same key — `/sponsors` (`nav.sponsorWall`) and
`/bulletins` (`nav.bulletins`). **Five drift.** Every navbar label for each is listed, as its source string — the mobile menu's
six text links render behind an emoji ("🔍 Track Application"; its "Browse All Animals" button
has none), so an accessible name is not always the string alone:

| Link | Navbar labels (en / ms) | Footer key (en / ms) |
|---|---|---|
| `/pets` | top bar "Meet Our Animals" / "Haiwan Kami"; Adoption menu "Meet Our Animals" / "Lihat Haiwan Reskue"; CTA "Adopt" / "Adopsi"; mobile "Meet Our Animals" / "Haiwan Reskue Kami"; mobile CTA "Browse All Animals" / "Semua Haiwan" | `nav.adoptablePets`: "Adoptable Pets" / "Haiwan Angkat" |
| `/#how-it-works` | "Adoption Process & Criteria" / "Proses & Syarat Adopsi" | `nav.adoptionProcess`: "Adoption Process" / "Proses Adopsi" |
| `/applications/track` | menu "Track Application Status" / "Semak Status Permohonan"; mobile "Track Application" / "Semak Status Permohonan" | `nav.trackApplication`: "Track Application" / "Semak Permohonan" |
| `/get-involved#volunteer` | "Volunteer & Field Shifts" / "Sukarelawan Santuari & TNRM" | `nav.volunteerFoster`: "Volunteer & Foster" / "Sukarelawan & Asuhan" |
| `/donate` | top bar "Donate & Sponsor" / "Taja & Sumbang"; mobile "Donate & Sponsor (LHDN)" / "Taja & Sumbang (LHDN)" | `nav.donate`: "Donate & Sponsor" / "Derma & Penajaan" |

Every Malay navbar label above differs from its key. In English, two navbar labels match the key —
`/donate`'s top bar and `/applications/track`'s mobile entry — and the rest differ. A link counts
as drifting here when any of its labels differs. The navbar also disagrees with itself: `/pets`
alone has five labels — five distinct wordings in Malay, three in English.

`nav.sponsorWall` was the one link fixed in PR #104, because the footer's copy of it was a fallback
for a key that did not exist; both halves are pinned in both languages, by
`tests/components/navbar.test.tsx` and `tests/components/footer.test.tsx`. Picking the wording for
the five is a copy decision, and fixing them one at a time with a one-off test each is the
special-casing this entry argues against.

**Keys with no reader.** Counted on 2026-10-14 by searching `src` for each key as a quoted literal:

- `home.*` — **13 of 25** have no reader: `bulletinsSubtitle`, `availableTitle`,
  `availableSubtitle`, `protocolsTitle`, `protocolsSubtitle`, and all eight of `protocol1Title`
  … `protocol4Desc` — which are the diverged duplicates of `HomeStandardsSection` above.
- `bulletins.*` — **8 of 22**: `badge`, the five `filter*` keys, `urgentBadge` and
  `contactCoordinator`.

A key built at runtime would not be found by that search, so these are candidates, not proof. An
earlier count in this entry was an estimate ("roughly 14 of 24 … 11 of 23") and named
`home.howItWorksSubtitle` and `bulletins.noBulletins`; the first now has a reader and the second
was deleted as a duplicate of `bulletins.noUpdates`.

## Why a guard, not another sweep

The 2026-09-22 deletion was hand-picked: it removed the keys whose component had just been deleted
and left every other orphan in place. That does not prevent the next orphan, and the next sweep will
be equally arbitrary. `tests/unit/i18n.test.ts` checks only that `en` and `ms` carry the same keys —
it cannot see that a key has no consumer, and nothing scans JSX for literals that bypass one.

The pieces for a structural guard now exist: `TranslationKey` in `src/lib/i18n/translations.ts`
derives every leaf path from the dictionary, and `useTypedTranslation()` in `LanguageProvider`
already enforces it at the call sites it covers. The other direction — keys that the code calls
but the dictionary lacks — is `tasks/open/translation-keys-the-dictionary-does-not-have.md`.

**Settles when:** a test asserts every dictionary leaf has a reader in `src` — with an explicit,
justified allowlist for any key deliberately kept unused — and the copy that currently bypasses a
key either uses it or the key is deleted. Either outcome is fine; two copies is not.
