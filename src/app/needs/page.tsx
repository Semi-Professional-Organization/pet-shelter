import { Metadata } from "next";
import {
  getServerRehabNeedsAsync,
  getServerRehabCategories,
} from "@/lib/server/rehabNeedsCatalog";
import { RehabNeedsSection } from "@/components/features/needs/RehabNeedsSection";
import { PackageOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "Rehabilitation House Needs & Wishlist | Hope for Strays UM",
  description:
    "Direct supply and equipment wishlist for recovering rescues at the Hope for Strays UM sanctuary in Petaling Jaya. Urgent medical feeds, F10 disinfectant, recovery cages, and TNRM traps.",
};

export default async function NeedsPage() {
  const initialNeeds = await getServerRehabNeedsAsync();
  // Only the categories the fixture actually populates, so the tab strip cannot
  // offer a filter that matches nothing.
  const initialNeedCategories = getServerRehabCategories();

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Hero Header */}
      <section className="w-full border-b border-border bg-muted/20 py-14 sm:py-20 px-6 sm:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider">
            <PackageOpen className="size-4" />
            Wishlist & House Supplies
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            Rehabilitation House Needs
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed">
            Our Sanctuary & Rehabilitation House cares for 40+ recovering dogs and cats post-surgery, trauma treatment, and mange therapy. Support their direct recovery by donating essential clinical nutrition, sterile wound supplies, and humane TNRM equipment.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-10">
        <RehabNeedsSection
          initialNeeds={initialNeeds}
          initialCategories={initialNeedCategories}
        />
      </section>
    </main>
  );
}
