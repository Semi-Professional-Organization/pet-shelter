import { Metadata } from "next";
import { AdoptionIntro, AdoptionCallToAction } from "@/components/features/adoptions/AdoptionIntro";
import { HomeProcessSection, HomeStandardsSection } from "@/components/layout/HomeSections";

export const metadata: Metadata = {
  title: "Adoption Process & Criteria | Hope for Strays UM",
  description:
    "How 100% free adoption works at Hope for Strays UM: browse and apply, meet the animal at the sanctuary, and welcome them home — plus the veterinary and home-suitability standards behind every placement.",
};

export default function AdoptionPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AdoptionIntro />
      <HomeProcessSection />
      <HomeStandardsSection />
      <AdoptionCallToAction />
    </div>
  );
}
