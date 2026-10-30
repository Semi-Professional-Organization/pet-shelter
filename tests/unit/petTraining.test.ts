import { describe, expect, it } from "vitest";

import initialPetsData from "@/data/pets.json";
import { calculatePetMatchScore } from "@/lib/domain/matchEngine";
import { trainingKindFor, trainingKindsIn } from "@/lib/domain/petTraining";
import type { QuizAnswers } from "@/types/match";
import type { Pet } from "@/types/pet";

const HOUSE_TRAINED_SPELLINGS = [
  "House-Trained",
  "House-trained",
  "house trained",
  "HOUSE_TRAINED",
  "Housetrained",
  "House\u2013Trained",
  "House\u2011Trained",
  "  House -  Trained ",
];

describe("trainingKindFor", () => {
  it.each([
    ...HOUSE_TRAINED_SPELLINGS.map((tag) => [tag, "houseTrained"]),
    ["Litter Box Trained", "litterBoxTrained"],
    ["litter-box-trained", "litterBoxTrained"],
    ["LitterBox Trained", "litterBoxTrained"],
    ["Litter Trained", "litterBoxTrained"],
    ["Leash Trained", "leashTrained"],
  ])("reads %j as %s", (tag, kind) => {
    expect(trainingKindFor(tag)).toBe(kind);
  });

  // The ceiling on purpose: synonyms and negations stay plain tags rather than being guessed at.
  it.each([
    "Playful",
    "",
    "Housebroken",
    "Not House Trained",
    "House Training",
    "House trained?",
    "House-trained 50%",
    "House-Trained, Leash Trained",
    "constructor",
    "toString",
    null as unknown as string,
  ])(
    "leaves %j unmatched",
    (tag) => {
      expect(trainingKindFor(tag)).toBeUndefined();
    },
  );
});

describe("trainingKindsIn", () => {
  it("lists each kind once, in display order, whatever the tag order", () => {
    expect(trainingKindsIn(["Leash Trained", "Playful", "House-trained", "House-Trained"])).toEqual([
      "houseTrained",
      "leashTrained",
    ]);
  });

  it("is empty when no tag is a training tag", () => {
    expect(trainingKindsIn(["Playful", "Gentle"])).toEqual([]);
  });
});

describe("match quiz house training", () => {
  // Rocky (pet-005) with his tags replaced and his special-needs note cleared: any
  // special-needs text, even a routine one, blocks the beginner score.
  const rocky = (initialPetsData as unknown as Pet[]).find((p) => p.id === "pet-005")!;
  const firstTimer: QuizAnswers = {
    housing: "landed_fenced_yard",
    household: "adults_only",
    existingPets: "none",
    dailyActivity: "moderate_30_60m",
    experience: "first_time",
  };
  const experienceFor = (tags: string[]) =>
    calculatePetMatchScore({ ...rocky, tags, medical: { ...rocky.medical, specialNeeds: "" } }, firstTimer).experienceScore;

  it("rewards every spelling the Training row accepts", () => {
    for (const tag of HOUSE_TRAINED_SPELLINGS) {
      expect(experienceFor([tag])).toBe(25);
    }
  });

  it("does not reward a tag the Training row leaves unmatched", () => {
    expect(experienceFor(["Not House-Trained"])).toBeLessThan(25);
  });
});
