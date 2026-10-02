import type { Metadata } from "next";
import { DonatePageView } from "@/components/features/donations/DonatePageView";
import { readAllocationSummary } from "@/lib/server/transparencyRepository";

export const metadata: Metadata = {
  title: "Donate & Sponsor a Rescue | Hope for Strays",
  description:
    "Fund emergency surgeries, vaccinations and daily nutrition for rescued strays in Petaling Jaya.",
  alternates: { canonical: "/donate" },
};

/** Matches /transparency so both surfaces refresh the ledger on the same cadence. */
export const revalidate = 300;

/**
 * Server Component: the allocation shares are read here and rendered into the
 * HTML, so this page shows the same derived figures as /transparency without a
 * client-side round trip.
 */
export default async function DonatePage() {
  // Only the derived figures — this page never lists individual expenses.
  const summary = await readAllocationSummary();

  return (
    <DonatePageView
      allocation={summary.allocation}
      impactStats={summary.impactStats}
      totalSen={summary.totalSen}
      source={summary.source}
    />
  );
}
