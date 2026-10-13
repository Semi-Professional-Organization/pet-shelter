import { Metadata } from "next";
import { BulletinFeed } from "@/components/features/bulletins/BulletinFeed";
import { BulletinsPageIntro } from "@/components/features/bulletins/BulletinsPageIntro";

export const metadata: Metadata = {
  title: "Bulletins & Updates | Hope for Strays (Petaling Jaya)",
  description: "Stay updated on shelter clinics, urgent foster needs, volunteer events, and rescue stories from Hope for Strays in Petaling Jaya, Selangor.",
};

export default function BulletinsPage() {
  return (
    <div className="min-h-screen bg-card py-12 sm:py-16">
      <div className="w-full px-6 sm:px-8 lg:px-12">
        <BulletinsPageIntro />

        {/* Full Feed with Admin Controls */}
        <BulletinFeed targetPage="all" titleKey="bulletins.allNoticesTitle" />
      </div>
    </div>
  );
}
