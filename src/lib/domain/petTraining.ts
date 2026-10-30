/**
 * Which training a pet's free-text tags record, for the pet page's Training row and the match
 * quiz. Domain, not presentation, because the quiz scoring needs it. React-free: the icons live in
 * `components/features/pets/PetTraining.tsx`, the same split as `PetStatusIcon`.
 *
 * Each kind is also its key under `petDetail` in the translation dictionaries.
 * The order here is the order the row shows them in.
 */
export const TRAINING_KINDS = ["houseTrained", "litterBoxTrained", "leashTrained"] as const;

export type TrainingKind = (typeof TRAINING_KINDS)[number];

// Each kind's own name is its tag key ("houseTrained" -> "housetrained"), so a new kind matches
// without a second list. Aliases are the only extra entries. That makes the kind names a data
// contract: renaming one changes which stored tags match, so add the old name as an alias.
const KIND_BY_TAG_KEY = new Map<string, TrainingKind>([
  ...TRAINING_KINDS.map((kind) => [kind.toLowerCase(), kind] as const),
  ["littertrained", "litterBoxTrained"],
]);

// ceiling: matches a tag only when it spells one of the keys above once case, spaces,
// underscores, dashes and the pasted invisible characters below are dropped, so "House-Trained", "house_trained" and
// "Housetrained" all match. Anything else stays a plain tag rather than being guessed at:
// synonyms ("Housebroken"), qualified tags ("House trained?", "Mostly house-trained") and
// combined tags ("House-Trained, Leash Trained") get no Training row and no quiz points.
// Also unmatched: trailing punctuation ("House-trained."), full-width letters (NFKC would
// fold them) and emoji variation selectors. Measured against the 10 pets in src/data/pets.json: all 6 training tags match, no other
// tag does. Only English tags match: a Malay tag such as "Terlatih Tandas" gets no row.
// Upgrade path: a tag table with fixed values (the unused PetTag model).
function tagKey(tag: string): string {
  // String() keeps a NULL tag element from throwing here; other tag readers still throw on
  // one (see tasks/open/free-text-pet-tags-are-matched-two-different-ways.md).
  // \s covers the BOM. \p{Pd} is every Unicode dash and hyphen and \u2212 the minus sign. The
  // rest are the invisible characters Word and web pages paste: soft hyphen, zero-width space
  // and joiners, left-to-right and right-to-left marks, word joiner. Not all of \p{Cf}: that
  // would also drop bidi overrides, so a tag shown reversed would still count.
  return String(tag).toLowerCase().replace(/[\s_\p{Pd}\u2212\u00AD\u200B-\u200F\u2060]+/gu, "");
}

export function trainingKindFor(tag: string): TrainingKind | undefined {
  return KIND_BY_TAG_KEY.get(tagKey(tag));
}

/** The training a pet's tags record, once each, in display order. Absent means unknown, never "no". */
export function trainingKindsIn(tags: readonly string[]): TrainingKind[] {
  const present = new Set(tags.map(trainingKindFor));
  return TRAINING_KINDS.filter((kind) => present.has(kind));
}

/** The tags left to show as chips: training tags drop out, because the Training row shows them. */
export function tagsWithoutTraining(tags: readonly string[]): string[] {
  return tags.filter((tag) => trainingKindFor(tag) === undefined);
}
