import React from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/components/providers/LanguageProvider";
import type { Language } from "@/lib/i18n/translations";
import type { Pet } from "@/types/pet";

/**
 * Shared plumbing for Tier 4. Not a `*.test.tsx` file, so the `components`
 * glob does not collect it.
 */

/**
 * Renders inside a real `LanguageProvider`.
 *
 * `useLanguage()` returns a hard-coded English fallback when no provider is
 * present, so components render without one — which is precisely why tests must
 * supply it. Rendering against the fallback would mean the bilingual paths
 * (`isMs`, the `ms` dictionary) were never exercised, and a test asking for
 * Malay would silently assert against English.
 */
export function renderWithLanguage(
  ui: React.ReactElement,
  { language = "en" as Language, ...options }: RenderOptions & { language?: Language } = {}
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <LanguageProvider defaultLanguage={language}>{children}</LanguageProvider>
    ),
    ...options,
  });
}

/**
 * `userEvent` with the pointer-events precondition disabled and no delay
 * between keystrokes.
 *
 * Base UI's dialog sets `pointer-events: none` on everything outside the open
 * popup. jsdom computes no layout, so user-event's visibility check reads that
 * inherited value on the popup's own children and refuses to click them —
 * a false negative about the environment, not about the component.
 *
 * The default `delay: 0` still yields to the timer queue after every
 * keystroke, which made the three form-heavy suites (about 2,650 typed
 * characters) the slowest files in the repo and the ones that hit the 20 s
 * timeout under load. `null` skips the yield; each keystroke is still a full
 * keydown, input and keyup sequence, and React still re-renders after each.
 */
export function setupUser() {
  return userEvent.setup({ pointerEventsCheck: 0, delay: null });
}

let petCounter = 0;

/**
 * Builds a complete `Pet`, overridable field by field.
 *
 * Every required field is populated so a test states only what it is actually
 * about; a fixture spread from `pets.json` would instead couple each test to
 * whatever that file happens to contain today.
 */
export function makePet(overrides: Partial<Pet> = {}): Pet {
  petCounter += 1;
  return {
    id: `pet-test-${petCounter}`,
    name: `Testy${petCounter}`,
    species: "dog",
    breed: "Local Mixed",
    age: "2 years",
    ageCategory: "young",
    gender: "Female",
    size: "Medium",
    weight: "18 kg",
    tags: ["House-Trained", "Good with Kids"],
    description: "A calm rescue dog looking for a home in Selangor.",
    rescueStory: "Found near Section 19, Petaling Jaya.",
    image: "https://example.test/pet.jpg",
    galleryImages: [],
    status: "Available",
    updates: [],
    medicalTimeline: [],
    medical: {
      vaccinated: true,
      microchipped: true,
      spayedNeutered: true,
    },
    compatibility: {
      goodWithDogs: true,
      goodWithCats: true,
      goodWithKids: true,
      energyLevel: "Moderate",
    },
    intakeDate: "2026-06-12",
    adoptionFee: "Free",
    featured: false,
    isArchived: false,
    deletedAt: null,
    ...overrides,
  };
}
