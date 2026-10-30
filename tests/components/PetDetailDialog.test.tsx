import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import { PetDetailDialog } from "@/components/features/pets/PetDetailDialog";
import { renderWithLanguage, makePet } from "./support/render";

describe("PetDetailDialog training row", () => {
  it("shows the gallery quick view's training once, as the row and not as chips", () => {
    renderWithLanguage(
      <PetDetailDialog
        pet={makePet({ id: "pet-dialog-under-test", tags: ["Litter Box Trained", "Playful"] })}
        open
        onOpenChange={vi.fn()}
        onStartAdoption={vi.fn()}
      />
    );

    const list = screen.getByRole("list", { name: /^training$/i });
    expect(within(list).getByText("Litter Box Trained")).toBeInTheDocument();
    expect(list.querySelector("svg")).toHaveClass("lucide-litter-box");
    expect(screen.getAllByText("Litter Box Trained")).toHaveLength(1);
    expect(screen.getByText("Playful")).toBeInTheDocument();
  });
});
