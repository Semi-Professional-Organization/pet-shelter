"use client";

import { useState } from "react";
import { Pet } from "@/types/pet";
import { usePetStore } from "@/lib/client/petStore";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import { usePetSponsorshipSummary } from "@/hooks/usePetSponsorshipSummary";
import { shouldShowSocialProof } from "@/lib/domain/petSponsorship";
import { SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";

export type PetDetailTab = "about" | "status" | "updates" | "support";

export interface UsePetDetailViewControllerProps {
  initialPet: Pet;
  initialTab?: PetDetailTab;
}

export function usePetDetailViewController({ initialPet, initialTab = "about" }: UsePetDetailViewControllerProps) {
  const { pets } = usePetStore();

  // Hydrate with client store version if available
  const pet = pets.find((p) => p.id === initialPet.id) || initialPet;
  const statusPresentation = getPetStatusPresentation(pet.status);
  const isAvailable = statusPresentation.isAdoptable;

  // Tabs & Modals
  const [activeTab, setActiveTab] = useState<PetDetailTab>(initialTab);
  const [isAdoptionOpen, setIsAdoptionOpen] = useState(false);
  const [isSponsorshipOpen, setIsSponsorshipOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // WhatsApp Inquiry URL pre-filled based on status
  const waMessage = statusPresentation.isInRehabilitation
    ? encodeURIComponent(
        `Hello Hope for Strays Selangor! I saw ${pet.name} (${pet.breed}, Ref: ${pet.id}) who is currently in rehabilitation. I would like to inquire about foster-to-adopt or visiting care.`
      )
    : encodeURIComponent(
        `Hello Hope for Strays Selangor! I am interested in inquiring about adopting ${pet.name} (${pet.breed}, Ref: ${pet.id}). Could you let me know about visiting arrangements?`
      );
  const waUrl = `${SHELTER_WHATSAPP_URL}?text=${waMessage}`;

  const handleShare = async () => {
    if (typeof window !== "undefined") {
      const shareData = {
        title: `Adopt ${pet.name} | Hope for Strays Petaling Jaya`,
        text: `Meet ${pet.name}, a lovable ${pet.breed} looking for a forever home in Selangor!`,
        url: window.location.href,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch {
          // Fallback to clipboard
        }
      }

      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Loaded after mount: this profile is prerendered, so a figure read during
  // render would be frozen at build time.
  const { summary: sponsorshipSummary, refresh: refreshSponsorship } =
    usePetSponsorshipSummary(pet.id);

  const showSocialProof = sponsorshipSummary ? shouldShowSocialProof(sponsorshipSummary) : false;
  const isFullySponsored = sponsorshipSummary?.isFullyFunded ?? false;

  return {
    state: {
      pet,
      pets,
      isAvailable,
      statusPresentation,
      activeTab,
      isAdoptionOpen,
      isSponsorshipOpen,
      copiedLink,
      waUrl,
      sponsorshipSummary,
      showSocialProof,
      isFullySponsored,
    },
    handlers: {
      setActiveTab,
      setIsAdoptionOpen,
      setIsSponsorshipOpen,
      handleShare,
      refreshSponsorship,
    },
  };
}
