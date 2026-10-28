/**
 * Which training a pet's free-text tags record, for the pet page's Training row and the match
 * quiz. React-free on purpose: the icons for each kind live in
 * `components/features/pets/PetTraining.tsx`, the same split as `PetStatusIcon`.
 *
 * Each kind is also its key under `petDetail` in the translation dictionaries.
 * The order here is the order the row shows them in.
 */
export const TRAINING_KINDS = ["houseTrained", "litterBoxTrained", "leashTrained"] as const;

export type TrainingKind = (typeof TRAINING_KINDS)[number];

const KIND_BY_TAG_KEY: Record<string, TrainingKind> = {
  housetrained: "houseTrained",
  litterboxtrained: "litterBoxTrained",
  littertrained: "litterBoxTrained",
  leashtrained: "leashTrained",
};

// ceiling: matches a tag only when it spells one of the keys above once case, spaces and
// punctuation are dropped, so "House-Trained", "house_trained" and "Housetrained" all match
// but synonyms such as "Housebroken" or "Potty Trained" do not, and such a pet simply gets
// no Training row. Measured against the 10 pets in src/data/pets.json: all 6 training tags
// match, no other tag does. Upgrade path: a tag table with fixed values (the unused PetTag
// model) instead of free text.
function tagKey(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z]/g, "");
}

export function trainingKindFor(tag: string): TrainingKind | undefined {
  const key = tagKey(tag);
  // hasOwn, so a tag such as "constructor" cannot reach Object.prototype.
  return Object.hasOwn(KIND_BY_TAG_KEY, key) ? KIND_BY_TAG_KEY[key] : undefined;
}

/** The training a pet's tags record, once each, in display order. Absent means unknown, never "no". */
export function trainingKindsIn(tags: readonly string[]): TrainingKind[] {
  const present = new Set(tags.map(trainingKindFor));
  return TRAINING_KINDS.filter((kind) => present.has(kind));
}
