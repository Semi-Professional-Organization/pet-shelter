import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";

// Reached through the adoption and sponsorship dialogs this view renders.
// Doubled for the same reason as in `AdoptionForm.test.tsx`: the real modules
// drag Prisma and `pg` into jsdom, and Tier 3 owns whether they are correct.
vi.mock("@/actions/applications", () => ({ submitApplication: vi.fn() }));
vi.mock("@/actions/donations", () => ({ submitDonationPledgeAction: vi.fn() }));

import { PetDetailView } from "@/components/features/pets/PetDetailView";
import { renderWithLanguage, setupUser, makePet } from "./support/render";

const TAB_IDS = ["about", "status", "updates", "support"] as const;

// Deliberately not a `pets.json` id. `usePetDetailViewController` hydrates from
// `usePetStore`, which seeds itself from that fixture, so reusing a real id
// ("pet-009") silently replaces this pet with the committed record and every
// assertion below would describe the fixture instead of the arrangement.
const pet = makePet({
  id: "pet-detail-under-test",
  name: "Bella",
  breed: "Labrador Mix",
  updates: [
    {
      id: "up-009-1",
      date: "2026-07-01",
      title: "Settling in beautifully",
      content: "Bella now walks calmly on a leash.",
      category: "milestone",
    },
  ],
});

function renderView(overrides: Partial<Parameters<typeof PetDetailView>[0]> = {}) {
  renderWithLanguage(<PetDetailView initialPet={pet} {...overrides} />);
  return { user: setupUser() };
}

const tabs = () => screen.getAllByRole("tab");
const tabList = () => screen.getByRole("tablist", { name: /pet profile tabs/i });

describe("PetDetailView", () => {
  describe("tab structure", () => {
    it("publishes all four profile tabs in one labelled tablist", () => {
      renderView();

      expect(tabList()).toBeInTheDocument();
      expect(within(tabList()).getAllByRole("tab")).toHaveLength(4);
    });

    it("wires every tab to the panel it controls", () => {
      renderView();

      tabs().forEach((tab, index) => {
        expect(tab).toHaveAttribute("id", `tab-${TAB_IDS[index]}`);
        expect(tab).toHaveAttribute("aria-controls", `panel-${TAB_IDS[index]}`);
      });
    });

    it("marks exactly one tab selected and renders only its panel", () => {
      renderView();

      expect(tabs().filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
      expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
      expect(document.getElementById("panel-about")).toBeInTheDocument();
      expect(document.getElementById("panel-status")).not.toBeInTheDocument();
    });

    it("opens on the tab named by initialTab", () => {
      renderView({ initialTab: "updates" });

      expect(tabs()[2]).toHaveAttribute("aria-selected", "true");
      expect(document.getElementById("panel-updates")).toBeInTheDocument();
    });

    it("switches the visible panel on click", async () => {
      const { user } = renderView();

      await user.click(tabs()[1]);

      expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
      expect(document.getElementById("panel-status")).toBeInTheDocument();
      expect(document.getElementById("panel-about")).not.toBeInTheDocument();
    });
  });

  describe("roving tabindex", () => {
    /**
     * The WAI-ARIA tabs pattern puts a single tab in the page's tab sequence and
     * moves between the rest with arrow keys. Asserting the whole row at once —
     * rather than just the active tab — is what catches the common regression of
     * leaving every tab at `tabIndex={0}`, which forces a keyboard user to tab
     * through all four to reach the content.
     */
    function tabIndexes() {
      return tabs().map((tab) => tab.getAttribute("tabindex"));
    }

    it("keeps only the selected tab in the tab sequence", () => {
      renderView();

      expect(tabIndexes()).toEqual(["0", "-1", "-1", "-1"]);
    });

    it("moves the tab sequence along with the selection", async () => {
      const { user } = renderView();

      await user.click(tabs()[2]);

      expect(tabIndexes()).toEqual(["-1", "-1", "0", "-1"]);
    });

    it("advances and focuses on ArrowRight", async () => {
      const { user } = renderView();
      tabs()[0].focus();

      await user.keyboard("{ArrowRight}");

      expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
      expect(tabs()[1]).toHaveFocus();
    });

    it("wraps from the last tab back to the first", async () => {
      const { user } = renderView({ initialTab: "support" });
      tabs()[3].focus();

      await user.keyboard("{ArrowRight}");

      expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
      expect(tabs()[0]).toHaveFocus();
    });

    it("wraps backwards from the first tab to the last on ArrowLeft", async () => {
      const { user } = renderView();
      tabs()[0].focus();

      await user.keyboard("{ArrowLeft}");

      expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
      expect(tabs()[3]).toHaveFocus();
    });

    it("treats ArrowDown and ArrowUp as the vertical equivalents", async () => {
      const { user } = renderView();
      tabs()[0].focus();

      await user.keyboard("{ArrowDown}");
      expect(tabs()[1]).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{ArrowUp}");
      expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
    });

    it("jumps to the first and last tab with Home and End", async () => {
      const { user } = renderView({ initialTab: "status" });
      tabs()[1].focus();

      await user.keyboard("{End}");
      expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
      expect(tabs()[3]).toHaveFocus();

      await user.keyboard("{Home}");
      expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
      expect(tabs()[0]).toHaveFocus();
    });

    it("ignores keys the pattern does not define", async () => {
      const { user } = renderView();
      tabs()[0].focus();

      await user.keyboard("{PageDown}");

      expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("sponsorship handoff", () => {
    it("deep-links to the donation page carrying the animal's identity and tier", async () => {
      const { user } = renderView();

      await user.click(tabs()[3]);

      const link = screen.getByRole("link", { name: /sponsor bella today/i });
      const href = link.getAttribute("href") ?? "";
      const query = new URLSearchParams(href.split("?")[1] ?? "");

      // `DonationWidget` reads exactly these three keys to preselect the
      // carousel card and the tier; this pins the producer to that contract.
      expect(href.startsWith("/donate?")).toBe(true);
      expect(query.get("pet")).toBe("Bella");
      expect(query.get("sponsorPetId")).toBe("pet-detail-under-test");
      expect(query.get("tier")).toBe("kibble");
    });

    it("lists the three sponsorship perks alongside the link", async () => {
      const { user } = renderView();

      await user.click(tabs()[3]);

      const panel = document.getElementById("panel-support")!;
      expect(within(panel).getByText(/monthly photo & video progress report/i)).toBeInTheDocument();
      expect(within(panel).getByText(/digital sponsorship certificate/i)).toBeInTheDocument();
      expect(within(panel).getByText(/invitation to arrange occasional sanctuary visits/i)).toBeInTheDocument();
    });
  });

  describe("training row", () => {
    const trainingList = () => screen.getByRole("list", { name: /^training$/i });

    it("lists the recorded training once each, in display order", () => {
      renderWithLanguage(
        <PetDetailView
          initialPet={makePet({ id: "pet-training-under-test", tags: ["Leash Trained", "House-trained", "House-Trained"] })}
        />
      );

      const items = within(trainingList()).getAllByRole("listitem");
      expect(items.map((li) => li.textContent)).toEqual(["House Trained", "Leash Trained"]);
      // Each kind keeps its own icon: a swap in the icon map would otherwise pass unnoticed.
      expect(items[0].querySelector("svg")).toHaveClass("lucide-house-check");
      expect(items[1].querySelector("svg")).toHaveClass("lucide-footprints");
    });

    it("leaves training tags out of the chips, so each fact shows once", () => {
      renderWithLanguage(
        <PetDetailView
          initialPet={makePet({ id: "pet-chips-under-test", tags: ["House-Trained", "Playful"] })}
        />
      );

      expect(screen.getByText("Playful")).toBeInTheDocument();
      expect(screen.queryByText("House-Trained")).not.toBeInTheDocument();
      expect(within(trainingList()).getByText("House Trained")).toBeInTheDocument();
    });

    it("renders nothing when no tag records training", () => {
      renderWithLanguage(
        <PetDetailView initialPet={makePet({ id: "pet-untrained-under-test", tags: ["Playful"] })} />
      );

      expect(screen.queryByRole("heading", { name: /^training$/i })).not.toBeInTheDocument();
    });

    it("labels the training in Malay", () => {
      renderWithLanguage(
        <PetDetailView initialPet={makePet({ id: "pet-training-ms-under-test", tags: ["Litter Box Trained"] })} />,
        { language: "ms" }
      );

      expect(screen.getByRole("heading", { name: /^latihan$/i })).toBeInTheDocument();
      expect(screen.getByText("Terlatih Guna Kotak Pasir")).toBeInTheDocument();
      expect(screen.getByRole("list", { name: /^latihan$/i }).querySelector("svg")).toHaveClass("lucide-litter-box");
    });
  });

  describe("status-dependent content", () => {
    it("counts published updates on the updates tab", () => {
      renderView();

      expect(within(tabs()[2]).getByText("1")).toBeInTheDocument();
    });

    it("offers a foster inquiry instead of adoption while in rehabilitation", async () => {
      renderWithLanguage(
        <PetDetailView
          initialPet={makePet({
            name: "Tiger",
            status: "In Rehabilitation",
            rehabStage: "Recovery",
            rehabProgressPercent: 60,
          })}
          initialTab="support"
        />
      );

      expect(await screen.findByText(/foster-to-adopt/i)).toBeInTheDocument();
    });
  });
});
