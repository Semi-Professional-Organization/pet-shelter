"use client";

import {
  Search,
  RotateCcw,
  Dog,
  Cat,
  SlidersHorizontal,
  X,
  Compass,
  HeartHandshake,
} from "lucide-react";
import { Pet } from "@/types/pet";
import { PetCard } from "./PetCard";
import { PetDetailDialog } from "./PetDetailDialog";
import { AdoptionForm } from "@/components/features/adoptions/AdoptionForm";
import { PetMatchQuiz } from "./PetMatchQuiz";
import { SponsorshipModal } from "./SponsorshipModal";
import { Button } from "@/components/ui/button";
import { usePetGalleryController } from "@/hooks/usePetGalleryController";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { AGE_BANDS, formatAgeBandRange } from "@/lib/domain/petAge";
import { GENDER_VALUES } from "@/lib/validations/pet";
import { genderLabelArgs } from "@/lib/presentation/petLabels";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";

/**
 * i18n keys for the lifecycle band names. The year range printed beside each name is derived
 * from `AGE_BAND_MIN_MONTHS`, not written here — hand-written ranges drifted from the maths and
 * left both 3 and 7 claimed by two filter options at once (PS-114).
 */
const AGE_BAND_LABEL_KEYS: Record<(typeof AGE_BANDS)[number], string> = {
  puppy_kitten: "pets.puppyKitten",
  young: "pets.young",
  adult: "pets.adult",
  senior: "pets.senior",
};

interface PetGalleryProps {
  initialPets?: Pet[];
  featuredOnly?: boolean;
  title?: string;
  subtitle?: string;
  showFilters?: boolean;
  syncUrl?: boolean;
}

export function PetGallery({
  initialPets,
  featuredOnly = false,
  title,
  subtitle,
  showFilters = true,
  syncUrl = true,
}: PetGalleryProps) {
  const { t, isMs } = useLanguage();
  const { state, handlers } = usePetGalleryController({ initialPets, featuredOnly, syncUrl });
  const {
    pets,
    filteredPets,
    hasActiveFilters,
    trackOptions,
    statusOptions,
    searchQuery,
    selectedSpecies,
    selectedGender,
    selectedAge,
    selectedSize,
    selectedStatus,
    selectedTrack,
    activePetForDetail,
    isDetailOpen,
    activePetForAdoption,
    isAdoptionOpen,
    isQuizOpen,
    isSponsorshipOpen,
    activePetForSponsorship,
  } = state;
  const {
    setSearchQuery,
    setSelectedSpecies,
    setSelectedGender,
    setSelectedAge,
    setSelectedSize,
    setSelectedStatus,
    setSelectedTrack,
    handleResetFilters,
    handleOpenDetail,
    handleOpenAdoption,
    handleOpenSponsor,
    setIsDetailOpen,
    setIsAdoptionOpen,
    setIsQuizOpen,
    setIsSponsorshipOpen,
    setActivePetForAdoption,
  } = handlers;

  const displayTitle = title || t("pets.title", "Adoptable Animals in Selangor");
  const displaySubtitle = subtitle || t("pets.subtitle", "Browse rescued dogs, cats, puppies, and kittens awaiting their forever homes in Petaling Jaya.");

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
        <div>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {displayTitle}
          </h2>
          {displaySubtitle && (
            <p className="text-base text-muted-foreground mt-1">
              {displaySubtitle}
            </p>
          )}
        </div>

        {/* Actions & Pet Counter */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsQuizOpen(true)}
            className="text-xs font-bold gap-1.5 text-foreground cursor-pointer"
          >
            <Compass className="size-3.5" />
            {t("nav.matchQuiz", "Compatibility Quiz")}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleOpenSponsor()}
            className="text-xs font-bold gap-1.5 cursor-pointer"
          >
            <HeartHandshake className="size-3.5" />
            {t("common.sponsor", "Sponsor")}
          </Button>

          {/* <div className="text-xs font-mono text-muted-foreground font-semibold px-2 py-1 bg-muted rounded-md">
            {filteredPets.length} / {pets.length} {isMs ? "haiwan" : "animals"}
          </div> */}
        </div>
      </div>

      {/* Track strip. Rendered from the population, so a shelter that has never rehomed an
          animal shows no "Adopted" tab, and a track that empties under the active filters stops
          being offered — *unless it is the selected one*, which stays at a count of 0 so the tab
          that explains an empty grid remains on screen and marked active
          (`buildVisibleTrackOptions`). "All" is always present because it is the way back out of
          a track. */}
      {showFilters && (trackOptions.length > 1 || selectedTrack !== "all") && (
        <div
          className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3"
          role="group"
          aria-label={t("pets.trackFilter", "Filter by care track")}
        >
          {[
            {
              value: "all",
              label: t("common.all", "All"),
              // Summed from the tracks, not taken from `filteredPets` — that list is already
              // narrowed to the selected track, so using it would make "All" count only the
              // tab you are standing on.
              count: trackOptions.reduce((total, option) => total + option.count, 0),
            },
            ...trackOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey, option.labelFallback),
              count: option.count,
            })),
          ].map((tab) => {
            const isActive = selectedTrack === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedTrack(tab.value)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-wide transition-colors focus-visible:ring-2 rounded-lg cursor-pointer ${
                  isActive
                    ? "bg-foreground text-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                <span
                  className={`font-mono text-xs ${isActive ? "opacity-80" : "opacity-70"}`}
                  aria-hidden="true"
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Controls Bar */}
      {showFilters && (
        <div className="mb-8 space-y-4 border border-border bg-card p-4 sm:p-6 rounded-2xl">
          
          {/* Top Bar: Search & Species Toggle */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
            {/* Search Input */}
            <div className="lg:col-span-8 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder={t("common.searchPlaceholder", "Search by name, breed, or personality tag...")}
                value={searchQuery}
                aria-label={t("common.search", "Search adoptable pets")}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-input pl-11 pr-10 py-2.5 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-foreground focus:border-transparent rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1.5 focus-visible:ring-2 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Species Toggle */}
            <div className="lg:col-span-4 flex items-center justify-between sm:justify-end gap-2.5">
              <div className="flex border border-border bg-muted/50 p-1 w-full sm:w-auto rounded-xl" role="group" aria-label="Filter by species">
                <button
                  type="button"
                  onClick={() => setSelectedSpecies("all")}
                  className={`flex-1 sm:flex-none px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors focus-visible:ring-2 rounded-lg cursor-pointer ${
                    selectedSpecies === "all"
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("common.all", "All")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSpecies("dog")}
                  className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors focus-visible:ring-2 rounded-lg cursor-pointer ${
                    selectedSpecies === "dog"
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Dog className="size-4" aria-hidden="true" />
                  {t("common.dogs", "Dogs")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSpecies("cat")}
                  className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors focus-visible:ring-2 rounded-lg cursor-pointer ${
                    selectedSpecies === "cat"
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Cat className="size-4" aria-hidden="true" />
                  {t("common.cats", "Cats")}
                </button>
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="size-3.5 mr-1" aria-hidden="true" />
                  {t("common.resetFilters", "Reset")}
                </Button>
              )}
            </div>
          </div>

          {/* Secondary Dropdown Selects */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3.5 pt-3 border-t border-border/60">
            <div>
              <label htmlFor="filter-gender" className="text-xs sm:text-sm font-semibold text-foreground block mb-1">
                {t("pets.genderFilter", "Gender")}
              </label>
              <select
                id="filter-gender"
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-foreground font-medium rounded-lg"
              >
                <option value="all">{isMs ? "Semua Jantina" : "All Genders"}</option>
                {GENDER_VALUES.map((gender) => (
                  <option key={gender} value={gender}>
                    {t(...genderLabelArgs(gender))}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-age" className="text-xs sm:text-sm font-semibold text-foreground block mb-1">
                {t("pets.ageFilter", "Age Group")}
              </label>
              <select
                id="filter-age"
                value={selectedAge}
                onChange={(e) => setSelectedAge(e.target.value)}
                className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-foreground font-medium rounded-lg"
              >
                <option value="all">{isMs ? "Semua Umur" : "All Ages"}</option>
                {AGE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {`${t(AGE_BAND_LABEL_KEYS[band])} (${formatAgeBandRange(band, isMs ? "ms" : "en")})`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-size" className="text-xs sm:text-sm font-semibold text-foreground block mb-1">
                {t("pets.sizeFilter", "Size")}
              </label>
              <select
                id="filter-size"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-foreground font-medium rounded-lg"
              >
                <option value="all">{isMs ? "Semua Saiz" : "All Sizes"}</option>
                <option value="Small">{isMs ? "Kecil (< 10 kg)" : "Small (< 10 kg)"}</option>
                <option value="Medium">{isMs ? "Sederhana (10 – 25 kg)" : "Medium (10 – 25 kg)"}</option>
                <option value="Large">{isMs ? "Besar (25+ kg)" : "Large (25+ kg)"}</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-status" className="text-xs sm:text-sm font-semibold text-foreground block mb-1">
                {t("pets.statusFilter", "Status")}
              </label>
              <select
                id="filter-status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-foreground font-medium rounded-lg"
              >
                <option value="all">{isMs ? "Semua Status" : "All Statuses"}</option>
                {/* Derived, not hand-listed. The hand-written list this replaces offered three
                    of the four statuses and silently omitted "Adopted" — the same omission
                    `buildPetStatusFilterOptions` was written to prevent after it happened to
                    the admin table. Options are scoped to the selected track, so the choices
                    on offer are always choices that match something. */}
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {`${t(option.labelKey, option.labelFallback)} (${option.count})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Spans the full row beneath the selects; `sm` is four columns wide now that gender
                joined age, size and status, so this follows rather than leaving a dangling cell. */}
            <div className="col-span-2 sm:col-span-4 md:col-span-1 flex items-end min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // A concrete adoptable animal: the first on screen, else the first in the shelter.
                  // This used to take `filteredPets[0]`, which the Adopted and In Rehabilitation
                  // tabs make non-adoptable by construction — open the Adopted tab, click here, and
                  // the form came up pre-filled for an animal who had already gone home.
                  //
                  // The second fallback looks redundant with `resolveDefaultPet`, which also picks
                  // the first Available animal when handed `null`. **It is not; do not remove it.**
                  // The form copies the selection into its fields only when it receives an actual
                  // pet (`if (selectedPet && open)` in `useAdoptionFormController`). Handed `null`,
                  // its title follows `resolveDefaultPet` while `petId` keeps whatever the last
                  // opening left there — reopen within the close animation and the form names one
                  // animal and would submit for another. It was removed once as dead code, on a
                  // review's word, and the next review found this.
                  //
                  // ceiling: still `null` when *no* animal in the shelter is adoptable, which
                  // reopens that stale-field path. `resolveDefaultPet` no longer papers over it
                  // with `allPets[0]` whatever its status, and `submitApplication` now refuses a
                  // pet it cannot find, one that is archived, and one whose status is not
                  // adoptable — so the worst outcome is a rejected submission rather than an
                  // application against an animal who has gone home. The stale field itself is
                  // `tasks/open/adoption-form-keeps-a-stale-pet-id-when-it-opens-on-nobody.md`.
                  const isAdoptable = (pet: (typeof pets)[number]) =>
                    getPetStatusPresentation(pet.status).isAdoptable;
                  setActivePetForAdoption(
                    filteredPets.find(isAdoptable) ?? pets.find(isAdoptable) ?? null
                  );
                  setIsAdoptionOpen(true);
                }}
                className="w-full min-w-0 whitespace-nowrap text-2xs sm:text-xs font-semibold px-3 py-2 focus-visible:ring-2 cursor-pointer"
              >
                {t("common.apply", "Adoption Form")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {filteredPets.length > 0 ? (
        <div
          className={
            featuredOnly
              ? "grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 items-stretch"
              : "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch"
          }
        >
          {(featuredOnly ? filteredPets.slice(0, 4) : filteredPets).map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              onSelectPet={handleOpenDetail}
              onAdoptPet={handleOpenAdoption}
              onSponsorPet={handleOpenSponsor}
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-12 border border-border bg-muted/20 p-8 space-y-3 rounded-2xl">
          <div className="mx-auto flex size-12 items-center justify-center bg-muted text-muted-foreground rounded-full">
            <SlidersHorizontal className="size-6" />
          </div>
          <h3 className="font-heading text-xl font-bold text-foreground">
            {t("pets.noResultsTitle", "No animals match your search filters")}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {t("pets.noResultsDesc", "Try adjusting your filter criteria or clear all filters to see all adoptable rescues.")}
          </p>
          <Button onClick={handleResetFilters} variant="outline" size="sm" className="text-sm font-semibold cursor-pointer">
            {t("common.resetFilters", "Reset Filters")}
          </Button>
        </div>
      )}

      {/* Pet Detail Profile Modal */}
      <PetDetailDialog
        pet={activePetForDetail}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onStartAdoption={handleOpenAdoption}
      />

      {/* Adoption Application Form Modal */}
      <AdoptionForm
        selectedPet={activePetForAdoption}
        allPets={pets}
        open={isAdoptionOpen}
        onOpenChange={setIsAdoptionOpen}
      />

      {/* Pet Match Quiz Modal */}
      <PetMatchQuiz
        open={isQuizOpen}
        onOpenChange={setIsQuizOpen}
        onSelectPet={handleOpenDetail}
        onApplyForPet={handleOpenAdoption}
      />

      {/* Rescue Sponsorship Modal */}
      <SponsorshipModal
        open={isSponsorshipOpen}
        onOpenChange={setIsSponsorshipOpen}
        targetPet={activePetForSponsorship}
      />
    </section>
  );
}
