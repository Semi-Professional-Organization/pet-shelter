import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { Pet } from "@/types/pet";
import { PetCard } from "@/components/features/pets/PetCard";
import { makePet, renderWithLanguage } from "./support/render";

/**
 * Tier 4 (jsdom). `PetCard` is rendered by the public catalogue and the home page's featured
 * strip, so a throw here does not break one card — it takes down the whole grid.
 */

function renderCard(overrides: Partial<Pet>) {
  return renderWithLanguage(<PetCard pet={makePet(overrides)} onSelectPet={vi.fn()} />);
}

describe("PetCard", () => {
  describe("the sex label", () => {
    it("labels the two recorded sexes", () => {
      renderCard({ gender: "Male", age: "2 years" });
      // The pill carries the sex alone; the age sits beside the name, where the weight was.
      expect(screen.getByText("Male")).toBeTruthy();
      expect(screen.getByText("2 years")).toBeTruthy();
    });

    it.each(["male", "Unknown", ""])(
      "renders instead of throwing when the stored value is %j",
      (stored) => {
        // `gender` is a free-text column, only cast by the mapper, so the type promises more than
        // the data does. An earlier version looked the label key up in a `Record<Gender, string>`:
        // any other value produced an `undefined` key, `t()` called `.split` on it, and the render
        // threw — one mistyped row crashing every card on the page.
        //
        // What is asserted is that the card renders a label, not which one: a stored "male" shows
        // as Female today, which is wrong for that row and kept only so this card agrees with the
        // dialog, detail page and carousel. Pinning the wording would make that a requirement.
        renderCard({ gender: stored as Pet["gender"], age: "1 year" });

        expect(screen.getByText(/^(Male|Female)$/)).toBeTruthy();
      }
    );
  });

  describe("training tags", () => {
    it.each([
      ["House-Trained", "lucide-house-check"],
      ["House Trained", "lucide-house-check"],
      ["Litter Trained", "lucide-litter-box"],
      ["leash_trained", "lucide-footprints"],
    ])("draws %j with the Training row's icon, not a text chip", (tag, iconClass) => {
      // The card's own TAG_ICONS matched only one exact spelling per tag and used other icons,
      // so a card and the quick view it opens disagreed on the same pet.
      const { container } = renderCard({ tags: [tag] });

      expect(container.querySelector(`svg.${iconClass}`)).not.toBeNull();
      expect(container.querySelector("li.bg-secondary")).toBeNull();
    });
  });
});

// The card's primary action follows getPlacementOptions: adopt for an available animal, foster
// for one tagged "Needs Socialising", sponsorship for one in rehabilitation.
function renderCardWithActions(overrides: Partial<Pet>) {
  renderWithLanguage(
    <PetCard pet={makePet(overrides)} onSelectPet={vi.fn()} onAdoptPet={vi.fn()} onSponsorPet={vi.fn()} />
  );
}

describe("PetCard primary action", () => {
  it("offers adoption for an available animal", () => {
    renderCardWithActions({ name: "Bolt", status: "Available", tags: ["Playful"] });
    expect(screen.getByRole("button", { name: /adopt/i })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /apply to foster/i })).not.toBeInTheDocument();
  });

  it("offers Apply to Foster, naming the animal, for one that needs socialising", () => {
    renderCardWithActions({ name: "Bolt", status: "Available", tags: ["Needs Socialising"] });
    const foster = screen.getByRole("link", { name: /apply to foster/i });
    expect(foster.getAttribute("href")).toContain(encodeURIComponent("foster Bolt"));
    expect(screen.queryByRole("button", { name: /^adopt$/i })).not.toBeInTheDocument();
  });

  it("offers sponsorship, not foster, for an animal in rehabilitation", () => {
    renderCardWithActions({ name: "Bolt", status: "In Rehabilitation", tags: ["Needs Socialising"] });
    expect(screen.getByRole("button", { name: /sponsor me/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /apply to foster/i })).not.toBeInTheDocument();
  });
});
