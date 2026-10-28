import { describe, expect, it } from "vitest";
import { Footprints } from "lucide-react";

import { HouseCheck, LitterBox } from "@/components/icons/pet-icons";
import { trainingIconFor, trainingKindFor, trainingKindsIn } from "@/components/features/pets/petTraining";

describe("trainingKindFor", () => {
  it.each([
    ["House-Trained", "houseTrained"],
    ["House-trained", "houseTrained"],
    ["house trained", "houseTrained"],
    ["HOUSE_TRAINED", "houseTrained"],
    ["  House -  Trained ", "houseTrained"],
    ["Litter Box Trained", "litterBoxTrained"],
    ["litter-box-trained", "litterBoxTrained"],
    ["Leash Trained", "leashTrained"],
  ])("reads %j as %s", (tag, kind) => {
    expect(trainingKindFor(tag)).toBe(kind);
  });

  it.each(["Playful", "", "Housetrained", "Not House Trained", "constructor", "toString"])(
    "leaves %j unmatched",
    (tag) => {
      expect(trainingKindFor(tag)).toBeUndefined();
    },
  );
});

describe("trainingIconFor", () => {
  it("maps each training tag to its icon", () => {
    expect(trainingIconFor("House-Trained")).toBe(HouseCheck);
    expect(trainingIconFor("Litter Box Trained")).toBe(LitterBox);
    expect(trainingIconFor("Leash Trained")).toBe(Footprints);
  });

  it("returns undefined for an unknown tag", () => {
    expect(trainingIconFor("Gentle")).toBeUndefined();
  });
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
