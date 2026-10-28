import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Pet } from "@/types/pet";
import { routerMock, setMockLocation } from "../setup/nextMocks";
import { GALLERY_PETS, ARCHIVED_PET_ID } from "./support/galleryPopulation";

/**
 * Tier 4 (`--project components`, jsdom) rather than `unit`.
 *
 * `usePetGalleryController` is a React hook: it holds `useState`, and every derivation it
 * publishes is a `useMemo` keyed on props and URL. Exercising it needs a renderer, and
 * `renderHook` mounts into a real container — the `unit` project runs in `node`, where there
 * is no `document` to mount into. There is no component to render here, so this drives the
 * hook directly instead of asserting through `PetGallery`'s markup: the claims below are about
 * the query string and the derived collections, and reading them off the DOM would test the
 * gallery's rendering as much as the controller's logic.
 *
 * `next/navigation` is not mocked here. `tests/setup/nextMocks.ts` already supplies
 * `useRouter`/`usePathname`/`useSearchParams` and clears the router spies before every test,
 * so a local `vi.mock` would be a second, drifting copy of the harness.
 */

/**
 * The store is doubled because the hook reads exactly one field from it, `pets`, and the real
 * one seeds itself from `pets.json` through `localStorage`. Left real, every population below
 * would be shadowed by whatever the fixture file happens to contain, and the fallback assertion
 * would be pinned to content edits rather than to this hook's wiring.
 */
const petStore = vi.hoisted(() => ({ pets: [] as Pet[] }));

vi.mock("@/lib/client/petStore", () => ({
  usePetStore: () => petStore,
}));

import { usePetGalleryController } from "@/hooks/usePetGalleryController";

const PATHNAME = "/pets";

interface RenderOptions {
  /** The query string the visitor arrived on, without the leading `?`. */
  search?: string;
  featuredOnly?: boolean;
  syncUrl?: boolean;
  initialPets?: Pet[];
}

function renderController({ search = "", initialPets = GALLERY_PETS, ...props }: RenderOptions = {}) {
  setMockLocation(PATHNAME, search);
  return renderHook(() => usePetGalleryController({ initialPets, ...props }));
}

/** The href handed to the nth `router.replace`, defaulting to the only expected one. */
function replacedHref(call = 0): string {
  return routerMock.replace.mock.calls[call]?.[0] as string;
}

/** The nth replace's query string, parsed — order of parameters is not a contract. */
function replacedQuery(call = 0): URLSearchParams {
  return new URLSearchParams(replacedHref(call).split("?")[1] ?? "");
}

const idsOf = (pets: readonly Pet[]) => pets.map((pet) => pet.id);

/** Every animal the public grid may show, in fixture order — what "not filtering" looks like. */
const PUBLIC_IDS = idsOf(GALLERY_PETS).filter((id) => id !== ARCHIVED_PET_ID);

/** The eight filter fields as the hook reports them when nothing is being filtered. */
const NEUTRAL_FILTER_STATE = {
  searchQuery: "",
  selectedSpecies: "all",
  selectedGender: "all",
  selectedAge: "all",
  selectedSize: "all",
  selectedStatus: "all",
  selectedTrack: "all",
  selectedPlacement: "all",
} as const;

describe("usePetGalleryController", () => {
  describe("population source", () => {
    it("prefers the supplied pets over the client store", () => {
      petStore.pets = [];

      const { result } = renderController();

      expect(idsOf(result.current.state.pets)).toEqual(idsOf(GALLERY_PETS));
    });

    it("falls back to the client store when no pets are supplied", () => {
      petStore.pets = GALLERY_PETS;
      setMockLocation(PATHNAME);

      const { result } = renderHook(() => usePetGalleryController());

      expect(idsOf(result.current.state.pets)).toEqual(idsOf(GALLERY_PETS));
    });
  });

  describe("the URL as the source of truth (syncUrl: true)", () => {
    it("reads all eight filters out of the query string", () => {
      const { result } = renderController({
        search: "search=Luna&species=dog&gender=Female&ageCategory=puppy_kitten&size=Small&status=Available&track=adoptable&type=adopt",
      });

      expect(result.current.state).toMatchObject({
        searchQuery: "Luna",
        selectedSpecies: "dog",
        selectedGender: "Female",
        selectedAge: "puppy_kitten",
        selectedSize: "Small",
        selectedStatus: "Available",
        selectedTrack: "adoptable",
        selectedPlacement: "adopt",
      });
    });

    it("ignores a placement the gallery does not offer", () => {
      const { result } = renderController({ search: "type=rehoming" });

      expect(result.current.state.selectedPlacement).toBe("all");
      expect(result.current.state.hasActiveFilters).toBe(false);
    });

    it("falls back to the neutral default for every filter the URL omits", () => {
      const { result } = renderController();

      expect(result.current.state).toMatchObject(NEUTRAL_FILTER_STATE);
    });

    it("writes a filter change to the URL without scrolling the page", () => {
      const { result } = renderController();

      act(() => result.current.handlers.setSelectedSpecies("cat"));

      // `scroll: false` is what keeps a filter change from throwing the visitor back to the
      // top of the grid they were reading.
      expect(routerMock.replace).toHaveBeenCalledWith("/pets?species=cat", { scroll: false });
    });

    it("preserves query parameters it does not own", () => {
      const { result } = renderController({ search: "utm_source=poster&species=dog" });

      act(() => result.current.handlers.setSelectedSize("Large"));

      // The gallery is not the only thing reading this URL; dropping foreign keys on every
      // filter change would silently break campaign attribution.
      expect(replacedQuery().get("utm_source")).toBe("poster");
      expect(replacedQuery().get("size")).toBe("Large");
    });
  });

  describe("local state (syncUrl: false)", () => {
    it("judges a track switch against a status set earlier in the same batch", () => {
      // `setSelectedTrack` keeps the status only where that status lives. It used to decide from
      // the render's `filters`, so a status and a track change applied together judged the track
      // change against the status from *before* the batch: "Pending" survived the switch to
      // Rehabilitation, leaving an empty grid holding a status that track cannot contain.
      const { result } = renderController({ syncUrl: false });

      act(() => {
        result.current.handlers.setSelectedStatus("Pending");
        result.current.handlers.setSelectedTrack("rehabilitation");
      });

      expect(result.current.state.selectedTrack).toBe("rehabilitation");
      expect(result.current.state.selectedStatus).toBe("all");
    });

    it("ignores the URL entirely, starting every filter at its default", () => {
      // The only `syncUrl: false` caller is the home page's featured strip, which renders no
      // filter controls. Seeding from the URL meant `/?track=alumni` narrowed that strip with
      // nothing on screen able to show or undo it — so a filtered link must land unfiltered.
      const { result } = renderController({
        syncUrl: false,
        search: "species=cat&search=Milo&track=rehabilitation&status=In+Rehabilitation",
      });

      expect(result.current.state).toMatchObject(NEUTRAL_FILTER_STATE);
      expect(result.current.state.hasActiveFilters).toBe(false);
      expect(idsOf(result.current.state.filteredPets)).toEqual(PUBLIC_IDS);
    });

    it("never touches the address bar, for any handler", () => {
      const { result } = renderController({ syncUrl: false });
      const { handlers } = result.current;

      act(() => {
        handlers.setSearchQuery("Luna");
        handlers.setSelectedSpecies("dog");
        handlers.setSelectedGender("Female");
        handlers.setSelectedAge("young");
        handlers.setSelectedSize("Small");
        handlers.setSelectedStatus("Available");
        handlers.setSelectedTrack("adoptable");
        handlers.handleResetFilters();
      });

      // The home page mounts this gallery; a `router.replace` there would rewrite the URL
      // under a visitor who never asked to filter anything.
      expect(routerMock.replace).not.toHaveBeenCalled();
    });

    it("applies filter changes to local state instead", () => {
      const { result } = renderController({ syncUrl: false });

      act(() => result.current.handlers.setSelectedSpecies("cat"));

      expect(result.current.state.selectedSpecies).toBe("cat");
      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-milo", "gallery-nala"]);
    });

    it("returns local state to the defaults on reset", () => {
      const { result } = renderController({ syncUrl: false });

      // Arranged through the handlers, not the URL: local mode no longer reads the URL, so a
      // URL-arranged start would already sit at the defaults and a reset that did nothing
      // would still pass. The precondition below is what makes the reset observable.
      act(() => {
        result.current.handlers.setSelectedSpecies("cat");
        result.current.handlers.setSearchQuery("Milo");
        result.current.handlers.setSelectedTrack("rehabilitation");
      });
      expect(result.current.state.hasActiveFilters).toBe(true);
      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-milo"]);

      act(() => result.current.handlers.handleResetFilters());

      expect(result.current.state).toMatchObject(NEUTRAL_FILTER_STATE);
      expect(result.current.state.hasActiveFilters).toBe(false);
      expect(idsOf(result.current.state.filteredPets)).toEqual(PUBLIC_IDS);
    });
  });

  describe("one history entry per interaction", () => {
    /**
     * The reason `updateFilters` takes a partial record instead of a single key. Two
     * `router.replace` calls in one tick would each be built from the same pre-change
     * `searchParams` snapshot, so the second would overwrite the first and one of the two
     * changes — most likely the status clear — would be silently dropped.
     */
    it("sets the track and clears the status in a single replace", () => {
      const { result } = renderController({ search: "status=Pending&species=dog" });

      act(() => result.current.handlers.setSelectedTrack("rehabilitation"));

      expect(routerMock.replace).toHaveBeenCalledTimes(1);
      expect(replacedQuery().get("track")).toBe("rehabilitation");
      expect(replacedQuery().has("status")).toBe(false);
      expect(replacedQuery().get("species")).toBe("dog");
    });

    it("clears a status that no longer exists under the new track", () => {
      // "Pending" lives under Adoptable and nowhere else, so carrying it into the alumni tab
      // would land the visitor on an empty grid with no visible cause.
      const { result } = renderController({ search: "track=adoptable&status=Pending" });

      act(() => result.current.handlers.setSelectedTrack("alumni"));

      expect(replacedHref()).toBe("/pets?track=alumni");
    });

    it("keeps the status when widening to all tracks", () => {
      // "Pending" still exists under All. Clearing it here turned "show me every track" into
      // "and throw away the status I picked" — the widening control silently narrowed nothing
      // and forgot a choice instead.
      const { result } = renderController({ search: "track=adoptable&status=Pending&species=dog" });

      act(() => result.current.handlers.setSelectedTrack("all"));

      expect(routerMock.replace).toHaveBeenCalledTimes(1);
      expect(replacedQuery().has("track")).toBe(false);
      expect(replacedQuery().get("status")).toBe("Pending");
      expect(replacedQuery().get("species")).toBe("dog");
    });

    it("keeps the status when switching to the track it belongs to", () => {
      // Arriving from All onto Pending's own track leaves the grid exactly as filtered as
      // before; the status is still one of that tab's options, so there is nothing to clear.
      const { result } = renderController({ search: "status=Pending" });

      act(() => result.current.handlers.setSelectedTrack("adoptable"));

      expect(routerMock.replace).toHaveBeenCalledTimes(1);
      expect(replacedQuery().get("track")).toBe("adoptable");
      expect(replacedQuery().get("status")).toBe("Pending");
    });
  });

  describe("query-string hygiene", () => {
    it("deletes a filter returned to its default rather than writing it out", () => {
      const { result } = renderController({ search: "species=dog&size=Small" });

      act(() => result.current.handlers.setSelectedSpecies("all"));

      // `?species=all` is noise in a shared link and would make `hasActiveFilters` the only
      // thing standing between the reset button and a URL that never empties.
      expect(replacedQuery().has("species")).toBe(false);
      expect(replacedQuery().get("size")).toBe("Small");
    });

    it("drops the question mark entirely when the last filter clears", () => {
      const { result } = renderController({ search: "species=dog" });

      act(() => result.current.handlers.setSelectedSpecies("all"));

      expect(replacedHref()).toBe("/pets");
    });

    it.each([
      ["golden ", "/pets?search=golden+"],
      ["  Luna  ", "/pets?search=++Luna++"],
    ])("writes the search %j as typed, spaces included", (typed, href) => {
      const { result } = renderController();

      act(() => result.current.handlers.setSearchQuery(typed));

      // The search box reads its value back from the URL. Trimmed on write, the space just
      // typed vanished on the next render, so "golden retriever" could not be entered at all.
      expect(replacedHref()).toBe(href);
    });

    it("reads a typed space back unchanged while matching on the trimmed query", () => {
      const { result } = renderController({ search: "search=luna+" });

      // The round trip is the point: the box must show the space the visitor typed. Writing
      // untrimmed is only safe because matching and `hasActiveFilters` trim, so `luna ` still
      // finds Luna rather than nobody.
      expect(result.current.state.searchQuery).toBe("luna ");
      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-luna"]);
      expect(result.current.state.hasActiveFilters).toBe(true);
    });

    it("treats an all-whitespace search as no search at all", () => {
      const { result } = renderController({ search: "search=Luna" });

      act(() => result.current.handlers.setSearchQuery("   "));

      expect(replacedHref()).toBe("/pets");
    });
  });

  /**
   * A filter value arrives as an arbitrary string — a mistyped link, a stale bookmark, an older
   * spelling. Raw, such a value filtered the grid while the control bound to it could show
   * nothing: `?status=available` emptied the grid under a blank select, and `?track=Adoptable`
   * lit no tab yet offered a Reset that reset nothing. Each case below pins the value the
   * controls read *and* the grid, because the defect was the two disagreeing.
   */
  describe("URL values no control can display", () => {
    it("reports the legacy rehabilitation alias as the canonical status the select offers", () => {
      const { result } = renderController({ search: "status=Rehabilitation" });
      const { state } = result.current;

      // The select's options are canonical. Reported raw, `Rehabilitation` matches no
      // `<option>` and the select renders blank while the grid is visibly filtered.
      expect(state.selectedStatus).toBe("In Rehabilitation");
      expect(state.statusOptions.map((option) => option.value)).toContain(state.selectedStatus);
      expect(idsOf(state.filteredPets)).toEqual(["gallery-milo", "gallery-nala"]);
      expect(state.hasActiveFilters).toBe(true);
    });

    it.each([["available"], ["Fostered"]])(
      "treats the unrecognised status %j as no status filter",
      (status) => {
        const { result } = renderController({ search: `status=${status}` });
        const { state } = result.current;

        // Unrecognised means "not filtering", never "match nothing": a bad link widens the grid
        // instead of emptying it behind a select that cannot say why.
        expect(state.selectedStatus).toBe("all");
        expect(idsOf(state.filteredPets)).toEqual(PUBLIC_IDS);
        expect(state.hasActiveFilters).toBe(false);
      }
    );

    it.each([["Adoptable"], ["xyz"]])("treats the unrecognised track %j as no track filter", (track) => {
      const { result } = renderController({ search: `track=${track}` });
      const { state } = result.current;

      // The grid already ignored an unknown track; what broke was the rest of the screen still
      // believing one was applied — no tab lit, and a Reset button with nothing to reset.
      expect(state.selectedTrack).toBe("all");
      expect(state.hasActiveFilters).toBe(false);
      expect(idsOf(state.filteredPets)).toEqual(PUBLIC_IDS);
    });

    it.each([
      ["species", "Dog", "selectedSpecies"],
      ["gender", "male", "selectedGender"],
      ["ageCategory", "Puppy", "selectedAge"],
      ["size", "small", "selectedSize"],
    ] as const)("treats the unrecognised %s value %j as no filter", (key, value, field) => {
      const { result } = renderController({ search: `${key}=${value}` });
      const { state } = result.current;

      // Wrong case is the realistic typo. Every base matcher is plain equality, so a raw value
      // here matched no animal and emptied the grid under a select showing nothing selected.
      expect(state[field]).toBe("all");
      expect(idsOf(state.filteredPets)).toEqual(PUBLIC_IDS);
      expect(state.hasActiveFilters).toBe(false);
    });
  });

  describe("hasActiveFilters", () => {
    it("is false when every filter sits at its default", () => {
      const { result } = renderController();

      expect(result.current.state.hasActiveFilters).toBe(false);
    });

    it("is false for a whitespace-only search, which filters nothing", () => {
      // `BASE_MATCHERS.search` trims before matching, so `?search=%20%20` narrows the grid by
      // nothing while the raw value differs from "" — the flag used to read that as an active
      // filter and offer a Reset button with nothing to reset. The setter deletes an
      // all-whitespace search rather than writing it, so only a hand-made or stale link gets here.
      const { result } = renderController({ search: "search=%20%20" });

      expect(result.current.state.hasActiveFilters).toBe(false);
      expect(result.current.state.filteredPets).toHaveLength(GALLERY_PETS.length - 1);
    });

    /**
     * Enumerated rather than spot-checked: the flag drives whether the reset button appears,
     * and it is derived from a key list that a new filter has to be added to. A filter missing
     * from that list still filters the grid while leaving the visitor no way to undo it.
     */
    it.each([
      ["search", "Luna"],
      ["species", "dog"],
      ["gender", "Male"],
      ["ageCategory", "young"],
      ["size", "Small"],
      ["status", "Pending"],
      ["track", "alumni"],
    ])("is true when %s alone differs from its default", (key, value) => {
      const { result } = renderController({ search: `${key}=${value}` });

      expect(result.current.state.hasActiveFilters).toBe(true);
    });
  });

  describe("handleResetFilters in URL mode", () => {
    it("clears every filter it owns in a single replace", () => {
      const { result } = renderController({
        search: "search=Luna&species=dog&gender=Female&size=Small&status=Available&track=adoptable",
      });

      act(() => result.current.handlers.handleResetFilters());

      expect(routerMock.replace).toHaveBeenCalledTimes(1);
      expect(replacedHref()).toBe("/pets");
      expect(replacedHref()).not.toContain("?");
    });

    it("keeps query parameters the gallery does not own", () => {
      // Reset used to `router.replace(pathname)`, which threw away `utm_source` and anything
      // else riding along — so the one control that says "show me everything" also detached
      // the visit from the campaign that brought it, while every other filter interaction
      // preserved it. Found by review after this suite pinned the preservation rule for
      // `updateFilters` but not for reset.
      const { result } = renderController({
        search: "species=dog&status=Available&utm_source=newsletter&ref=poster",
      });

      act(() => result.current.handlers.handleResetFilters());

      const href = replacedHref();
      expect(href).toContain("utm_source=newsletter");
      expect(href).toContain("ref=poster");
      expect(href).not.toContain("species=");
      expect(href).not.toContain("status=");
    });
  });

  describe("filteredPets", () => {
    it("hides archived animals from the public grid", () => {
      const { result } = renderController();

      // Staff-only. The server actions filter them too; this is the client store's copy of
      // that rule, and the archived fixture is also `featured`, so nothing else hides it.
      expect(idsOf(result.current.state.filteredPets)).not.toContain(ARCHIVED_PET_ID);
      expect(result.current.state.filteredPets).toHaveLength(GALLERY_PETS.length - 1);
    });

    it("keeps only featured animals when featuredOnly is set", () => {
      const { result } = renderController({ featuredOnly: true });

      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-luna", "gallery-milo"]);
    });

    it("filters by gender", () => {
      const { result } = renderController({ search: "gender=Male" });

      // Gender is the newest entry in `BASE_MATCHERS`; the archived male proves the base
      // matchers run on top of the archive rule rather than instead of it.
      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-rex", "gallery-milo"]);
    });

    it("combines independent filters as an intersection", () => {
      const { result } = renderController({ search: "species=cat&size=Small" });

      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-nala"]);
    });

    it("searches name, breed, description and tags", () => {
      expect(idsOf(renderController({ search: "search=luna" }).result.current.state.filteredPets)).toEqual(["gallery-luna"]);
      expect(idsOf(renderController({ search: "search=beagle" }).result.current.state.filteredPets)).toEqual(["gallery-cleo"]);
      expect(idsOf(renderController({ search: "search=fracture" }).result.current.state.filteredPets)).toEqual(["gallery-milo"]);
      expect(idsOf(renderController({ search: "search=alumni" }).result.current.state.filteredPets)).toEqual(["gallery-cleo"]);
    });

    it("matches both spellings of rehabilitation under one status", () => {
      const { result } = renderController({ search: "status=In+Rehabilitation" });

      // Nala is filed under the legacy `Rehabilitation` alias. Raw string equality here drops
      // her from a filter that names her condition exactly.
      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-milo", "gallery-nala"]);
    });
  });

  describe("trackOptions", () => {
    const countsOf = (options: readonly { value: string; count: number }[]) =>
      Object.fromEntries(options.map((option) => [option.value, option.count]));

    it("counts every populated track when nothing is filtered", () => {
      const { result } = renderController();

      expect(countsOf(result.current.state.trackOptions)).toEqual({
        adoptable: 2,
        rehabilitation: 2,
        alumni: 1,
      });
    });

    it("narrows the counts by the other active filters", () => {
      const { result } = renderController({ search: "search=luna" });

      // "Searching Luna shows which tracks Luna is in, rather than which tracks the shelter
      // has" — the tab strip is built from the population the other filters already left.
      expect(countsOf(result.current.state.trackOptions)).toEqual({ adoptable: 1 });
    });

    it("ignores the track filter itself", () => {
      const { result } = renderController({ search: "track=alumni" });

      // The tabs have to keep showing what is behind the other tabs, or selecting one would
      // collapse the strip to the tab you are standing on and there would be no way back.
      expect(countsOf(result.current.state.trackOptions)).toEqual({
        adoptable: 2,
        rehabilitation: 2,
        alumni: 1,
      });
      expect(idsOf(result.current.state.filteredPets)).toEqual(["gallery-cleo"]);
    });

    it("drops a track nobody is in", () => {
      const { result } = renderController({ featuredOnly: true });

      expect(countsOf(result.current.state.trackOptions)).toEqual({ adoptable: 1, rehabilitation: 1 });
    });

    /** Value and count in order, because the tab strip renders them in exactly this order. */
    const tabsOf = (options: readonly { value: string; count: number }[]) =>
      options.map((option) => [option.value, option.count]);

    it("keeps the selected track as a zero-count tab when other filters empty it", () => {
      // No male animal is alumni. Dropping the empty track here — as for any other empty track —
      // took away the one tab that could be marked active, leaving an empty grid with nothing
      // on screen admitting a track was still applied.
      const { result } = renderController({ search: "track=alumni&gender=Male" });

      expect(result.current.state.filteredPets).toEqual([]);
      expect(tabsOf(result.current.state.trackOptions)).toEqual([
        ["adoptable", 1],
        ["rehabilitation", 1],
        ["alumni", 0],
      ]);
    });

    it("puts a kept empty tab in catalogue order rather than at the end", () => {
      // Alumni is last in the sequence anyway, so the case above cannot tell a sorted strip from
      // an appended one. Adoptable kept at zero would otherwise jump behind Rehabilitation and
      // the tabs would reorder under the visitor's cursor.
      const { result } = renderController({ search: "track=adoptable&species=cat" });

      expect(tabsOf(result.current.state.trackOptions)).toEqual([
        ["adoptable", 0],
        ["rehabilitation", 2],
      ]);
    });
  });

  describe("statusOptions", () => {
    const valuesOf = (options: readonly { value: string }[]) => options.map((option) => option.value);

    it("is scoped to the selected track", () => {
      const { result } = renderController({ search: "track=adoptable" });

      // Status is staged inside track, not parallel to it: offering "Adopted" while standing
      // in the adoptable tab is a control that can only ever empty the grid.
      expect(valuesOf(result.current.state.statusOptions)).toEqual(["Available", "Pending"]);
    });

    it("collapses both rehabilitation spellings into one option", () => {
      const { result } = renderController({ search: "track=rehabilitation" });

      expect(result.current.state.statusOptions).toEqual([
        expect.objectContaining({ value: "In Rehabilitation", count: 2 }),
      ]);
    });

    it("still reflects the other filters inside the track", () => {
      const { result } = renderController({ search: "track=adoptable&gender=Male" });

      expect(valuesOf(result.current.state.statusOptions)).toEqual(["Pending"]);
    });
  });

  describe("dialog state", () => {
    it("opens the detail dialog on the animal it was handed", () => {
      const { result } = renderController();

      act(() => result.current.handlers.handleOpenDetail(GALLERY_PETS[0]));

      expect(result.current.state.isDetailOpen).toBe(true);
      expect(result.current.state.activePetForDetail?.id).toBe("gallery-luna");
    });

    it("opens the sponsorship dialog with no animal for a general donation", () => {
      const { result } = renderController();

      act(() => result.current.handlers.handleOpenSponsor());

      // The sponsor CTA in the gallery header is not attached to any one animal; passing
      // `undefined` through as `null` is what keeps the dialog on its general-fund branch.
      expect(result.current.state.isSponsorshipOpen).toBe(true);
      expect(result.current.state.activePetForSponsorship).toBeNull();
    });
  });
});
