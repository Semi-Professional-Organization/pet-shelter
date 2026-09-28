---
target: src/app/page.tsx
total_score: 24
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
target_identity: "file:/Users/erinkxw/pet-shelter/src/app/page.tsx"
target_fingerprint: "sha256:baa675f6326e79c3dd174092e04466b3b4ef91213026fbe0e546f1ac8fca510b"
target_path: /Users/erinkxw/pet-shelter/src/app/page.tsx
timestamp: 2026-09-06T14-55-22Z
slug: src-app-page-tsx
---
## Design Specificity Verdict
The homepage has a coherent warm shelter palette and real local content, but its structure is category-interchangeable: hero, impact stats, three pillars, four action cards, updates, gallery, and standards. The detector found no page-specific anti-pattern rules, but the visual review found repeated card-grid composition and generic action language that make the product feel generated rather than authored.

## Heuristic Scores
| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading exists, but the initial pet fetch occurs before Suspense. |
| 2 | Match System / Real World | 3 | Local shelter content is strong, but generic labels dilute it. |
| 3 | User Control and Freedom | 3 | Clear links and controls; public homepage has limited direct control needs. |
| 4 | Consistency and Standards | 3 | Consistent tokens, but public and admin visual languages diverge. |
| 5 | Error Prevention | 2 | Runtime Prisma fallback and unrelated guard failures indicate integrity risk. |
| 6 | Recognition Rather Than Recall | 3 | Familiar navigation and action labels, but many equal-weight sections compete. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface; not a primary criterion for the homepage. |
| 8 | Aesthetic and Minimalist Design | 2 | Repeated rounded cards and all-caps labels create visual sameness. |
| 9 | Error Recovery | 2 | Runtime fallback is logged but not surfaced as a user-facing state. |
| 10 | Help and Documentation | n/a | Persuade surface; not a primary criterion for the homepage. |

Total: 24/32

## Priority Issues
### [P1] Template-like homepage rhythm
Location: src/app/page.tsx, src/components/layout/Hero.tsx, src/components/layout/HomeSections.tsx
Impact: The familiar hero -> stats -> pillars -> action cards -> feed -> gallery sequence makes the shelter indistinguishable from a generated nonprofit landing page.
Recommendation: Make one documentary shelter story the dominant second section, reduce equal-weight card grids, and move supporting actions into a quieter utility band.

### [P1] Card repetition flattens hierarchy
Location: src/components/layout/HomeSections.tsx
Impact: Pillars, quick actions, process steps, standards, and community content all use near-identical bordered rounded panels.
Recommendation: Reserve cards for genuinely discrete objects; use open editorial bands, rules, image-led rows, and one dominant CTA.

### [P2] Generic copy and label density
Location: src/components/layout/HomeSections.tsx, src/components/layout/Hero.tsx
Impact: Labels such as Quick actions, Learn More, Our Impact So Far, and Pillar 1 sound interchangeable and push the local TNRM story into body copy.
Recommendation: Replace generic labels with specific local language and action verbs tied to shelter reality.

### [P2] Mobile action stack is too tall
Location: src/components/layout/HomeSections.tsx
Impact: At 375px, the four quick-action links become roughly 216-238px tall each, delaying the next meaningful content and creating repetitive scrolling.
Recommendation: Use a compact two-column action rail or a single primary action plus short secondary links.

### [P2] Runtime data fallback undermines trust
Location: src/app/page.tsx, src/lib/server/*
Impact: The browser console reports an invalid Prisma Pet.updates relation and falls back to fixture data, so the homepage may show synthetic/stale animals while appearing live.
Recommendation: Fix the relation drift and make loading/error states explicit.

## What's Working
- Warm terracotta/cream tokens and Playfair/Geist pairing give the product a recognizable shelter tone.
- Hero imagery, descriptive alt text, semantic landmarks, and responsive breakpoints are present.
- The page has real domain specificity in TNRM, Universiti Malaya, Petaling Jaya, veterinary care, and bilingual copy.

## Persona Red Flags
- First-timer: sees several broad choices before a clear explanation of what makes this shelter distinct; the primary adopt action is present but not reinforced by a clear next-step narrative.
- Mobile visitor: must pass through four long, similar action cards before reaching animals and updates.
- Staff/power user: admin UI relies on dense tabs and long labels such as Pet Management (CRUD), which increases scanning cost.

## Minor Observations
- Buttons use an app-wide uppercase tracked style even where sentence-case would feel more human.
- The page-specific detector returned zero findings, but repository design guards still fail on unrelated impact-page raw colors/arbitrary values, email token parity, and primary contrast.
- No homepage-specific reduced-motion override was found for animated states.

## Questions to Consider
- What if the first scroll after the hero showed one real rescue story instead of three abstract pillars?
- Which action matters most on the homepage: meet animals, visit the sanctuary, or support TNRM?
- Can the interface feel warm and documentary without turning every piece of content into a rounded card?
