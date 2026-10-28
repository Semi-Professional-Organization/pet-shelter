import { describe, expect, it } from "vitest";

import { trainingKindFor, trainingKindsIn } from "@/lib/presentation/petTraining";

describe("trainingKindFor", () => {
  it.each([
    ["House-Trained", "houseTrained"],
    ["House-trained", "houseTrained"],
    ["house trained", "houseTrained"],
    ["HOUSE_TRAINED", "houseTrained"],
    ["Housetrained", "houseTrained"],
    ["House–Trained", "houseTrained"],
    ["  House -  Trained ", "houseTrained"],
    ["Litter Box Trained", "litterBoxTrained"],
    ["litter-box-trained", "litterBoxTrained"],
    ["LitterBox Trained", "litterBoxTrained"],
    ["Litter Trained", "litterBoxTrained"],
    ["Leash Trained", "leashTrained"],
  ])("reads %j as %s", (tag, kind) => {
    expect(trainingKindFor(tag)).toBe(kind);
  });

  // The ceiling on purpose: synonyms and negations stay plain tags rather than being guessed at.
  it.each(["Playful", "", "Housebroken", "Not House Trained", "House Training", "constructor", "toString"])(
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
