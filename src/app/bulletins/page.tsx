import { Metadata } from "next";
import { BulletinFeed } from "@/components/features/bulletins/BulletinFeed";
import { getPublicBulletins } from "@/lib/server/bulletinRepository";

export const metadata: Metadata = {
  title: "Bulletins & Updates | Hope for Strays (Petaling Jaya)",
  description: "Stay updated on shelter clinics, urgent foster needs, volunteer events, and rescue stories from Hope for Strays in Petaling Jaya, Selangor.",
};

/**
 * Matches `/`, which reads the same table on the same cadence. Saving a notice
 * in the admin editor calls `revalidatePath("/bulletins")`, so this is the
 * floor rather than the latency an editor sees.
 */
export const revalidate = 300;

export default async function BulletinsPage() {
  // Every published notice, whatever page it targets: this is the full archive.
  const bulletins = await getPublicBulletins("all");

  return (
    <div className="min-h-screen bg-card py-12 sm:py-16">
      <div className="w-full px-6 sm:px-8 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Shelter Updates & Bulletins
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">
            Community spay/neuter clinic schedules, urgent foster requests, and video updates from our rescue sanctuary in Petaling Jaya.
          </p>
        </div>

        <BulletinFeed bulletins={bulletins} title="All Community Notices" />
      </div>
    </div>
  );
}
