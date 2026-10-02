import { Metadata } from "next";
import { Suspense } from "react";
import { PetGallery } from "@/components/features/pets/PetGallery";
import { getPublicPets } from "@/actions/pets";
import { Loader2 } from "lucide-react";

/**
 * Kept dynamic explicitly.
 *
 * This page was dynamic by accident of reading `searchParams`, and dropping that prop below
 * would otherwise have made it statically prerendered — a silent rendering-mode change, made in
 * a worktree where `next build` cannot run to observe it. Two things make that worth pinning
 * rather than discovering later: a build that cannot reach the database bakes the `pets.json`
 * fixtures into the page until the next revalidation — the outage fallback, which
 * `tasks/decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md` allows for the
 * length of an outage and no longer (the profile pages do not yet keep to that:
 * `tasks/open/a-profile-rendered-in-an-outage-can-stay-cached.md`) — and the catalogue is the surface
 * where a stale animal is most visible. `/faq`, `/get-involved` and `/sponsors` already say this
 * the same way.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adoptable Dogs & Cats | Hope for Strays (Petaling Jaya)",
  description:
    "Browse rescue dogs and cats currently available for adoption at Hope for Strays shelter in Petaling Jaya, Selangor.",
};

export default async function PetsDirectoryPage() {
  // The whole public population, deliberately unfiltered.
  //
  // This page used to read the filter search params and narrow the query before handing the
  // result to the gallery, which then narrowed it again from the same URL. The second pass is
  // the one that matters — it is what re-runs when a visitor touches a control — and the first
  // now actively breaks the tab strip: track tabs and status options are counted from the
  // population the gallery receives, so pre-narrowing to `?status=Pending` would report every
  // other track as empty and hide the tabs that lead out of it.
  //
  // ceiling: sends every non-archived animal in one payload. Fine at shelter scale (tens to low
  // hundreds); page it, or move faceting to the server, if the catalogue outgrows ~500.
  const initialPets = await getPublicPets();

  return (
    <div className="min-h-screen bg-card pb-20">
      {/* Directory Gallery */}
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12 pt-8 sm:pt-10">
        <Suspense
          fallback={
            <div className="flex min-h-[360px] items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="size-8 animate-spin mr-2" />
              <span>Loading adoptable animals...</span>
            </div>
          }
        >
          <PetGallery
            initialPets={initialPets}
            showFilters={true}
          />
        </Suspense>
      </div>

    </div>
  );
}
