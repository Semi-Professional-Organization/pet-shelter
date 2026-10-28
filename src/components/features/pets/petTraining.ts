import { Footprints, type LucideIcon } from "lucide-react";

import { HouseCheck, LitterBox } from "@/components/icons/pet-icons";

/**
 * Training tags and their icons, for the pet page's Training row.
 *
 * Lives in components rather than `src/lib/` for the reason `PetStatusIcon` gives: the
 * mapping imports a React icon package, and LAYERS.md §5.3 records what happens when
 * `lib/` takes one.
 *
 * Tags are free text in `Pet.tags` ("House-Trained" and "House-trained" both occur), so
 * a tag matches on a normalised key: case, hyphens, underscores and spaces are ignored.
 * The order here is the order the row shows them in.
 */
export const TRAINING_KINDS = ["houseTrained", "litterBoxTrained", "leashTrained"] as const;

export type TrainingKind = (typeof TRAINING_KINDS)[number];

const KIND_BY_TAG_KEY: Record<string, TrainingKind> = {
  "house trained": "houseTrained",
  "litter box trained": "litterBoxTrained",
  "leash trained": "leashTrained",
};

export const ICON_BY_TRAINING: Record<TrainingKind, LucideIcon> = {
  houseTrained: HouseCheck,
  litterBoxTrained: LitterBox,
  leashTrained: Footprints,
};

function tagKey(tag: string): string {
  return tag.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

export function trainingKindFor(tag: string): TrainingKind | undefined {
  const key = tagKey(tag);
  // hasOwn, so a tag such as "constructor" cannot reach Object.prototype.
  return Object.hasOwn(KIND_BY_TAG_KEY, key) ? KIND_BY_TAG_KEY[key] : undefined;
}

export function trainingIconFor(tag: string): LucideIcon | undefined {
  const kind = trainingKindFor(tag);
  return kind ? ICON_BY_TRAINING[kind] : undefined;
}

/** The training a pet's tags record, once each, in display order. Absent means unknown, never "no". */
export function trainingKindsIn(tags: readonly string[]): TrainingKind[] {
  const present = new Set(tags.map(trainingKindFor));
  return TRAINING_KINDS.filter((kind) => present.has(kind));
}
