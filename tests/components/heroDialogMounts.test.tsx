import { describe, it, expect, vi } from "vitest";

import { PetMatchQuiz } from "@/components/features/pets/PetMatchQuiz";
import { SponsorshipModal } from "@/components/features/pets/SponsorshipModal";
import { Hero } from "@/components/layout/Hero";
import { Navbar } from "@/components/layout/Navbar";
import { renderWithLanguage } from "./support/render";

/**
 * Tier 4: that `Hero` mounts no dialog it cannot open.
 *
 * `Hero` held `isQuizOpen`/`isSponsorshipOpen` and mounted `PetMatchQuiz` and
 * `SponsorshipModal` with them, passing the setters only to the dialogs' own
 * `onOpenChange` — which can close a dialog but never open one. The buttons
 * that drove them were removed by `68b1981` and `112c78e`; neither removed the
 * mounts. Visitors lost nothing when they went: `Navbar` mounts both on every
 * page and `PetGallery`'s header buttons render on `/` outside its `showFilters`
 * block, so `/` still offers both.
 *
 * Asserting on the DOM cannot prove this. A dialog with `open={false}` renders
 * no nodes, so the tree looks identical whether or not it is mounted. Nor can a
 * `localStorage` spy: the dialogs' stores are module-level, so they read their
 * keys when the module is first imported, before any `beforeEach` can install a
 * spy — a spy-based version of this test passed against the unfixed component.
 *
 * What does discriminate is whether the component functions are invoked at all,
 * which is what these module mocks record. They are registered here rather than
 * in `home.test.tsx` so that the substitution cannot affect any other suite.
 */
vi.mock("@/components/features/pets/PetMatchQuiz", () => ({
  PetMatchQuiz: vi.fn(() => null),
}));

vi.mock("@/components/features/pets/SponsorshipModal", () => ({
  SponsorshipModal: vi.fn(() => null),
}));

describe("Hero dialog mounts", () => {
  it("substitutes both dialog modules for a component that does mount them", () => {
    // The positive control. Both assertions below are "was not called", which
    // would pass just as well if the mock factory key were misspelled, the
    // import specifier renamed, or the substitution not reaching the tree at
    // all — the mocks would simply never run. `Navbar` mounts both dialogs,
    // so if the wiring is live it must record them. Without this case, the
    // Hero assertions are assumed rather than discriminating.
    renderWithLanguage(<Navbar />);

    expect(vi.mocked(PetMatchQuiz)).toHaveBeenCalled();
    expect(vi.mocked(SponsorshipModal)).toHaveBeenCalled();
  });

  it("renders neither the quiz nor the sponsorship dialog", () => {
    vi.mocked(PetMatchQuiz).mockClear();
    vi.mocked(SponsorshipModal).mockClear();

    renderWithLanguage(<Hero />);

    expect(vi.mocked(PetMatchQuiz)).not.toHaveBeenCalled();
    expect(vi.mocked(SponsorshipModal)).not.toHaveBeenCalled();
  });
});
