import { Suspense } from "react";
import { Hero } from "@/components/layout/Hero";
import { PetGallery } from "@/components/features/pets/PetGallery";
import { BulletinFeed } from "@/components/features/bulletins/BulletinFeed";
import {
  HomeGalleryLoading,
  HomeStandardsSection,
  HomeOurWorkSection,
  HomeProcessSection,
  HomeQuickActionsSection,
  HomeViewAllPetsLink,
} from "@/components/layout/HomeSections";
import { getPublicPets } from "@/actions/pets";
import { getPublicBulletins } from "@/lib/server/bulletinRepository";
import { readHomeImpactStats } from "@/lib/server/transparencyRepository";
import { selectHomeMetrics } from "@/lib/domain/metrics";

/**
 * Matches /donate and /transparency, which read the same table on the same
 * cadence. This is the floor, not the latency an editor sees: `LEDGER_PATHS`
 * in `src/actions/transparency.ts` includes "/", so saving an impact counter
 * purges this page on demand rather than leaving it stale for five minutes.
 */
export const revalidate = 300;

export default async function HomePage() {
  // Read in parallel: neither depends on the other, and the impact read already
  // degrades to an empty list rather than throwing, so one slow or unreachable
  // query cannot take the whole page down.
  const [initialPets, impactStats, bulletins] = await Promise.all([
    getPublicPets(),
    readHomeImpactStats(),
    // Folded into the same parallel read. Like the impact read it degrades
    // rather than throwing — to no notices when the database is down, to the
    // launch notices when the table does not exist yet (see
    // `mayServeFixtureAfter`) — so a slow or failing feed cannot take the home
    // page down over one section.
    getPublicBulletins("home", 2),
  ]);

  // Staff-curated figures overlaid on the FE-02 baseline. See src/lib/domain/metrics.ts
  // for why these are not counted from the pet table.
  const metrics = selectHomeMetrics(impactStats);

  return (
    <div className="flex flex-col bg-background">
      {/* 1. Hero Section with 5 Impact Stats */}
      <Hero metrics={metrics} />

      {/* 2. FE-03: Our Work — The 3 Core Pillars (TNRM, Education, Rehab) */}
      <HomeOurWorkSection />

      <HomeQuickActionsSection />

      {/* 3. Latest bulletins */}
      <section className="bg-work-ground py-16 sm:py-20">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          <BulletinFeed bulletins={bulletins} titleKey="home.bulletinsTitle" />
        </div>
      </section>

      {/* 4. Adoptable & Recovering Pets Gallery Showcase */}
      <section id="adopt" className="bg-work-ground py-16 sm:py-20">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          <Suspense fallback={<HomeGalleryLoading />}>
            <PetGallery
              initialPets={initialPets}
              featuredOnly
              showFilters={false}
              syncUrl={false}
            />
          </Suspense>

          <HomeViewAllPetsLink />
        </div>
      </section>

      {/* 5. Adoption Process Steps — the #how-it-works anchor */}
      <HomeProcessSection />

      {/* 6. Shelter Standards & Veterinary Commitments */}
      <HomeStandardsSection />
    </div>
  );
}
