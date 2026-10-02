import { Metadata } from "next";
import {
  AdoptOrFosterIntro,
  AdoptBranch,
  FosterBranch,
  AdoptOrFosterCallToAction,
} from "@/components/features/adoptions/AdoptOrFoster";
import { HomeProcessSection, HomeStandardsSection } from "@/components/layout/HomeSections";

export const metadata: Metadata = {
  title: "Adopt or Foster | Hope for Strays UM",
  description:
    "Adopt a rescue for life or foster one while it recovers — both are free and follow the same three steps at Hope for Strays UM: apply, meet the animal at the sanctuary, and welcome them home.",
};

export default function AdoptionPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AdoptOrFosterIntro />
      <AdoptBranch />
      <FosterBranch />
      <HomeProcessSection />
      <HomeStandardsSection />
      <AdoptOrFosterCallToAction />
    </div>
  );
}
