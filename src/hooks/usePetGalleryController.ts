"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Pet, PetStatus } from "@/types/pet";
import { usePetStore } from "@/lib/client/petStore";
import { normalizePetStatus } from "@/lib/domain/stateMachine";
import { matchesPetSearch } from "@/lib/domain/petSearch";
import { petFilterSchema } from "@/lib/validations/pet";
import {
  buildVisibleStatusFilterOptions,
  buildVisibleTrackOptions,
  getPetTrack,
  isPetTrack,
  isPlacementType,
  matchesPlacementFilter,
  matchesStatusFilter,
  matchesTrackFilter,
} from "@/lib/presentation/petStatusPresentation";

/**
 * Every filter the gallery offers, keyed by the URL parameter it round-trips through, with the
 * value that means "not filtering".
 *
 * This used to be five parallel copies of the same four-part pattern — a `useState`, a
 * `searchParams.get` fallback, a branch inside `updateUrlParams`, and a `useCallback` setter —
 * one set per filter. Adding gender and track by that method would have made seven, and the
 * fifth copy is already four past the point where AGENTS.md says to abstract. Now a filter is
 * one line here plus, if it is not a plain equality, one line in `BASE_MATCHERS`.
 */
const FILTER_DEFAULTS = {
  search: "",
  species: "all",
  gender: "all",
  ageCategory: "all",
  size: "all",
  status: "all",
  track: "all",
  // "Looking to" adopt or foster — set by the Apply to Adopt / Apply to Foster buttons on /adoption.
  type: "all",
} as const;

export type PetFilterKey = keyof typeof FILTER_DEFAULTS;

type FilterValues = Record<PetFilterKey, string>;

/** A set of changes, or a function of the current resolved filters that returns one. */
type FilterUpdate = Partial<FilterValues> | ((current: FilterValues) => Partial<FilterValues>);

const FILTER_KEYS = Object.keys(FILTER_DEFAULTS) as PetFilterKey[];

/**
 * The filters that narrow the population independently of one another.
 *
 * `track` and `status` are deliberately absent: they are staged rather than parallel — status is
 * scoped *within* the selected track — so they are applied below in that order instead of being
 * folded in here.
 */
const BASE_MATCHERS: Record<
  "search" | "species" | "gender" | "ageCategory" | "size" | "type",
  (pet: Pet, value: string) => boolean
> = {
  // Shared with `getPublicPets`; the two copies this replaced had already drifted once.
  search: matchesPetSearch,
  species: (pet, value) => pet.species === value,
  gender: (pet, value) => pet.gender === value,
  ageCategory: (pet, value) => pet.ageCategory === value,
  size: (pet, value) => pet.size === value,
  // Parallel, not staged: it narrows the population before tracks and statuses are counted, so
  // their counts describe the animals a visitor looking to foster can actually apply for.
  type: matchesPlacementFilter,
};

const BASE_MATCHER_KEYS = Object.keys(BASE_MATCHERS) as (keyof typeof BASE_MATCHERS)[];

/** The URL-carried filters whose accepted values `petFilterSchema` already declares. */
const SCHEMA_KEYS = ["species", "gender", "ageCategory", "size", "status"] as const;

/**
 * The filters as they actually apply, from whatever the URL or local state holds.
 *
 * A filter value arrives as an arbitrary string — a mistyped link, a stale bookmark, an older
 * spelling. Left raw, an unrecognised value did two contradictory things at once: the grid
 * treated it one way while the controls could not show it at all. `?status=available` matched no
 * animal and left the select blank; `?track=Adoptable` matched every animal yet highlighted no
 * tab and offered a Reset that reset nothing; `?status=Rehabilitation` filtered correctly while
 * the select, whose options are canonical, rendered empty.
 *
 * So every value is resolved once, here, and everything downstream — matching, option lists,
 * the highlighted control, `hasActiveFilters` — reads the same resolved value:
 *
 * - an unrecognised value means "not filtering", never "match nothing", so a bad link widens the
 *   grid instead of emptying it behind a control that cannot explain why;
 * - a recognised status is reported in its canonical spelling, so the legacy alias selects the
 *   option that actually exists.
 *
 * Accepted values come from `petFilterSchema` and `PET_TRACK_SEQUENCE` rather than a list here,
 * so this cannot drift from the schema or the tab strip. It does not make the server agree:
 * `getPublicPets` has its own equality checks, does not resolve its input through this schema, and
 * treats an unrecognised value as "match nothing" where the gallery treats it as "all". No
 * production caller passes it filters today; `tasks/open/get-public-pets-trusts-its-filter-input.md`.
 */
function resolveFilters(raw: FilterValues): FilterValues {
  const resolved = { ...raw };
  for (const key of SCHEMA_KEYS) {
    if (!petFilterSchema.shape[key].safeParse(raw[key]).success) resolved[key] = FILTER_DEFAULTS[key];
  }
  if (resolved.status !== FILTER_DEFAULTS.status) {
    resolved.status = normalizePetStatus(resolved.status as PetStatus);
  }
  if (!isPetTrack(resolved.track)) resolved.track = FILTER_DEFAULTS.track;
  if (!isPlacementType(resolved.type)) resolved.type = FILTER_DEFAULTS.type;
  return resolved;
}

export interface UsePetGalleryControllerProps {
  initialPets?: Pet[];
  featuredOnly?: boolean;
  syncUrl?: boolean;
}

export function usePetGalleryController({
  initialPets,
  featuredOnly = false,
  syncUrl = true,
}: UsePetGalleryControllerProps = {}) {
  const { pets: storePets } = usePetStore();
  const pets = initialPets || storePets;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const readFromUrl = useCallback(
    (key: PetFilterKey) => searchParams?.get(key) || FILTER_DEFAULTS[key],
    [searchParams]
  );

  // Used only when `syncUrl` is false, and then the URL plays no part in either direction: not
  // written, and not read. This hook used to seed local state from the query string "so a
  // filtered link still lands filtered", but its only such caller is the home page's featured
  // strip, which renders no filter controls — so `/?track=alumni` narrowed that strip to
  // adopted animals with nothing on screen able to show or undo it. A filter nobody can see is
  // not a feature.
  const [localFilters, setLocalFilters] = useState<FilterValues>(() => ({ ...FILTER_DEFAULTS }));

  const filters: FilterValues = useMemo(() => {
    const raw = syncUrl
      ? (Object.fromEntries(FILTER_KEYS.map((key) => [key, readFromUrl(key)])) as FilterValues)
      : localFilters;
    return resolveFilters(raw);
  }, [syncUrl, localFilters, readFromUrl]);

  /**
   * Apply any number of filter changes at once.
   *
   * Taking a partial record rather than one key is what lets "switching track also clears the
   * status" be a single history entry. With a setter per filter it would have been two
   * `router.replace` calls in the same tick, the second built from a `searchParams` snapshot
   * that predates the first — so one of the two changes would be dropped.
   */
  const updateFilters = useCallback(
    (update: FilterUpdate) => {
      if (!syncUrl) {
        // Resolved against *live* state, not the render that created this callback, so a change
        // that depends on another filter sees any earlier change in the same batch.
        setLocalFilters((current) => ({
          ...current,
          ...(typeof update === "function" ? update(resolveFilters(current)) : update),
        }));
        return;
      }
      if (!router || !pathname) return;

      // ceiling: URL mode has no live state to read — `searchParams` is the snapshot this render
      // received, so two updates in the same tick build from the same base and the second drops
      // the first. That is the hazard the comment above describes. The upgrade path is a ref
      // holding the last written query, or `window.history.replaceState`; recorded in
      // `tasks/open/gallery-url-round-trip-is-never-exercised.md`, not solved here.
      const updates = typeof update === "function" ? update(filters) : update;
      const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
      for (const [key, value] of Object.entries(updates) as [PetFilterKey, string][]) {
        // Search is written as typed, and only *compared* trimmed. It used to be trimmed on the
        // way in, and the box reads its value back from the URL — so typing a space wrote
        // `search=golden`, the box re-rendered without the space, and "golden retriever" could
        // not be typed at all. The matcher and `hasActiveFilters` trim, so a trailing space
        // costs nothing; an all-whitespace search still clears the parameter.
        const neutral = (key === "search" ? value.trim() : value) === FILTER_DEFAULTS[key];
        if (neutral) params.delete(key);
        else params.set(key, value);
      }

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [syncUrl, router, pathname, searchParams, filters]
  );

  const setFilter = useCallback(
    (key: PetFilterKey, value: string) => updateFilters({ [key]: value }),
    [updateFilters]
  );

  // Named setters kept so the component reads as prose. They are aliases over `setFilter`, not
  // seven more copies of it.
  const setSearchQuery = useCallback((value: string) => setFilter("search", value), [setFilter]);
  const setSelectedSpecies = useCallback((value: string) => setFilter("species", value), [setFilter]);
  const setSelectedGender = useCallback((value: string) => setFilter("gender", value), [setFilter]);
  const setSelectedAge = useCallback((value: string) => setFilter("ageCategory", value), [setFilter]);
  const setSelectedSize = useCallback((value: string) => setFilter("size", value), [setFilter]);
  const setSelectedStatus = useCallback((value: string) => setFilter("status", value), [setFilter]);
  const setSelectedPlacement = useCallback((value: string) => setFilter("type", value), [setFilter]);

  /**
   * Changing track keeps the status only where that status still lives.
   *
   * Status options are scoped to the track: "Pending" exists under Adoptable and nowhere else, so
   * carrying it to Rehabilitation would land the visitor on an empty grid with no visible cause.
   * But it does exist under "All", and under its own track — clearing it there too, as this used
   * to, turned "widen the view to every track" into "throw away the status I picked". The test is
   * a pure question about the status, answered by the same `getPetTrack` that built the tabs.
   */
  //
  // Decided inside the update rather than from this render's `filters`: in local mode a status
  // change and a track change in the same batch would otherwise judge the track change against
  // the status from *before* the batch, and keep a status the switch should have cleared.
  const setSelectedTrack = useCallback(
    (value: string) =>
      updateFilters((current) => {
        const statusSurvives =
          current.status === FILTER_DEFAULTS.status ||
          !isPetTrack(value) ||
          getPetTrack(current.status as PetStatus) === value;
        return statusSurvives ? { track: value } : { track: value, status: FILTER_DEFAULTS.status };
      }),
    [updateFilters]
  );

  // Modal Dialog States
  const [activePetForDetail, setActivePetForDetail] = useState<Pet | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [activePetForAdoption, setActivePetForAdoption] = useState<Pet | null>(null);
  const [isAdoptionOpen, setIsAdoptionOpen] = useState(false);

  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isSponsorshipOpen, setIsSponsorshipOpen] = useState(false);
  const [activePetForSponsorship, setActivePetForSponsorship] = useState<Pet | null>(null);

  /**
   * Everything the independent filters accept. Track and status are applied after this, so the
   * tab strip built from it counts animals under the *other* active filters — searching "Luna"
   * shows which tracks Luna is in, rather than which tracks the shelter has.
   */
  const baseFilteredPets = useMemo(() => {
    return pets.filter((pet) => {
      // Archived animals are staff-only. The server actions filter them too; this is the client
      // store's copy of that rule, not a substitute for it.
      if (pet.isArchived) return false;
      if (featuredOnly && !pet.featured) return false;

      return BASE_MATCHER_KEYS.every((key) => {
        const value = filters[key];
        if (value === FILTER_DEFAULTS[key]) return true;
        return BASE_MATCHERS[key](pet, value);
      });
    });
  }, [pets, featuredOnly, filters]);

  const trackOptions = useMemo(
    () => buildVisibleTrackOptions(baseFilteredPets, filters.track),
    [baseFilteredPets, filters.track]
  );

  const trackScopedPets = useMemo(
    () => baseFilteredPets.filter((pet) => matchesTrackFilter(pet.status, filters.track)),
    [baseFilteredPets, filters.track]
  );

  const statusOptions = useMemo(
    () => buildVisibleStatusFilterOptions(trackScopedPets, filters.status),
    [trackScopedPets, filters.status]
  );

  const filteredPets = useMemo(
    // Canonical comparison, or filtering for one spelling of "In Rehabilitation" silently drops
    // animals filed under the legacy alias.
    () => trackScopedPets.filter((pet) => matchesStatusFilter(pet.status, filters.status)),
    [trackScopedPets, filters.status]
  );

  // Compared against the same trimmed value `BASE_MATCHERS.search` filters on, or an inbound
  // `?search=%20%20` reports an active filter while matching every animal — a Reset button
  // offering to clear nothing. The setter writes search as typed (so a space can be followed by
  // another word) and deletes it only when it is all whitespace, so a trailing space is ordinary
  // here, not a stale link. `filters` is already resolved, so an unrecognised value in any other
  // key has become its default and does not count as active either.
  const hasActiveFilters = FILTER_KEYS.some(
    (key) => (key === "search" ? filters[key].trim() : filters[key]) !== FILTER_DEFAULTS[key]
  );

  /**
   * Reset is just "every filter back to its neutral value", which `updateFilters` already
   * knows how to express: a value equal to its default is deleted from the query string.
   *
   * Writing it that way rather than `router.replace(pathname)` keeps query parameters the
   * gallery does not own. A bare pathname dropped `utm_source` and anything else riding along,
   * so clicking Reset silently detached the visit from whatever campaign brought it — while
   * every other filter interaction preserved them. It also settles the URL/local split in one
   * place instead of branching on `syncUrl` again.
   */
  const handleResetFilters = useCallback(
    () => updateFilters({ ...FILTER_DEFAULTS }),
    [updateFilters]
  );

  const handleOpenDetail = (pet: Pet) => {
    setActivePetForDetail(pet);
    setIsDetailOpen(true);
  };

  const handleOpenAdoption = (pet: Pet) => {
    setActivePetForAdoption(pet);
    setIsAdoptionOpen(true);
  };

  const handleOpenSponsor = (pet?: Pet | null) => {
    setActivePetForSponsorship(pet || null);
    setIsSponsorshipOpen(true);
  };

  return {
    state: {
      pets,
      filteredPets,
      hasActiveFilters,
      /** Track tabs and status options, both derived from the population actually on screen. */
      trackOptions,
      statusOptions,
      searchQuery: filters.search,
      selectedSpecies: filters.species,
      selectedGender: filters.gender,
      selectedAge: filters.ageCategory,
      selectedSize: filters.size,
      selectedStatus: filters.status,
      selectedTrack: filters.track,
      selectedPlacement: filters.type,
      activePetForDetail,
      isDetailOpen,
      activePetForAdoption,
      isAdoptionOpen,
      isQuizOpen,
      isSponsorshipOpen,
      activePetForSponsorship,
    },
    handlers: {
      setSearchQuery,
      setSelectedSpecies,
      setSelectedGender,
      setSelectedAge,
      setSelectedSize,
      setSelectedStatus,
      setSelectedTrack,
      setSelectedPlacement,
      handleResetFilters,
      handleOpenDetail,
      handleOpenAdoption,
      handleOpenSponsor,
      setIsDetailOpen,
      setIsAdoptionOpen,
      setIsQuizOpen,
      setIsSponsorshipOpen,
      setActivePetForDetail,
      setActivePetForAdoption,
      setActivePetForSponsorship,
    },
  };
}
