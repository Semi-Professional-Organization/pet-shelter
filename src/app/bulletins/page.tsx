import { Metadata } from "next";
import { BulletinFeed } from "@/components/features/bulletins/BulletinFeed";
import { BulletinsPageIntro } from "@/components/features/bulletins/BulletinsPageIntro";
import { getPublicBulletins } from "@/lib/server/bulletinRepository";

export const metadata: Metadata = {
  title: "Shelter Bulletins | Hope for Strays (Petaling Jaya)",
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
        <BulletinsPageIntro />

        <BulletinFeed bulletins={bulletins} titleKey="bulletins.allNoticesTitle" />
      </div>
    </div>
  );
}
