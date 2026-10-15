"use client";

import { useState } from "react";
import { Pet } from "@/types/pet";
import { SponsorshipTier, DonationReceipt, SponsorshipTierId } from "@/types/sponsorship";
import { SPONSORSHIP_TIERS } from "@/lib/client/sponsorshipStore";
import { tierAmountFor } from "@/lib/domain/sponsorshipTiers";
import { MIN_SPONSORSHIP_SEN } from "@/lib/domain/petSponsorship";
import { ringgitFromSen } from "@/lib/domain/money";
import {
  DONATION_RECORDING_UNCONFIRMED_MESSAGE,
  SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE,
  safeContributionFailureMessage,
} from "@/lib/domain/contributionFailure";
import { submitDonationPledgeAction } from "@/actions/donations";
import type { DonationPledgeDTO } from "@/lib/validations/donation";
import {
  createPetSponsorshipAction,
  type SponsorshipPledgeDTO,
} from "@/actions/sponsorships";

export interface UseSponsorshipControllerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPet?: Pet | null;
  initialTierId?: SponsorshipTierId;
}

/**
 * What checkout produced. Both arms are now pledges, not receipts.
 *
 * `donation_receipt` was the general-gift arm until 2026-09-22, when the donation
 * form stopped issuing an official `HFS-DON-*` number from a supporter's word that
 * they had paid. Both lanes now end at a claim reference, and the Section 44(6)
 * receipt is issued from the coordinator's queue in `/admin/donations`. The two
 * arms remain distinct because the money lands in two tables and the two
 * references are drawn from different series.
 */
export type CheckoutOutcome =
  | { type: "sponsorship_pledge"; data: SponsorshipPledgeDTO }
  | { type: "donation_pledge"; data: DonationPledgeDTO };

type PaymentMethod = Exclude<DonationReceipt["paymentMethod"], "card">;

const GENERAL_DONATION_MINIMUM_MYR = 5;
const PET_SPONSORSHIP_MINIMUM_MYR = ringgitFromSen(MIN_SPONSORSHIP_SEN);

export function useSponsorshipController({
  targetPet,
  initialTierId,
}: UseSponsorshipControllerProps) {
  const initialTier =
    SPONSORSHIP_TIERS.find((t) => t.id === initialTierId) || SPONSORSHIP_TIERS[1]; // Default to Vaccine (RM 50)

  const [selectedTier, setSelectedTier] = useState<SponsorshipTier>(initialTier);
  const [isCustomTier, setIsCustomTier] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>("50");
  const [frequency, setFrequency] = useState<"one_time" | "monthly">("one_time");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("duitnow_qr");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [wantsTaxReceipt, setWantsTaxReceipt] = useState(false);
  const [taxIdOrIc, setTaxIdOrIc] = useState("");
  const [notes, setNotes] = useState("");
  const [copiedBank, setCopiedBank] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedCheckout, setCompletedCheckout] = useState<CheckoutOutcome | null>(null);

  const minimumAmount = targetPet
    ? PET_SPONSORSHIP_MINIMUM_MYR
    : GENERAL_DONATION_MINIMUM_MYR;

  // Tier prices differ by frequency, so the payable amount follows the toggle
  // rather than the one-time list price.
  const parsedCustomAmount = Number(customAmount);
  const finalAmount = isCustomTier
    ? Number.isFinite(parsedCustomAmount)
      ? parsedCustomAmount
      : 0
    : tierAmountFor(selectedTier, frequency);

  const handleCopyMaybank = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText("514012345678");
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2500);
    }
  };

  const handleSelectTier = (tier: SponsorshipTier) => {
    setIsCustomTier(false);
    setSelectedTier(tier);
  };

  const handleSelectCustom = () => {
    setIsCustomTier(true);
  };

  const handleCompleteDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!donorName.trim() || !donorEmail.trim()) {
      setErrorMessage("Please fill in your name and email so we can confirm your contribution.");
      return;
    }

    if (finalAmount < minimumAmount) {
      setErrorMessage(
        `Minimum ${targetPet ? "sponsorship" : "donation"} amount is RM ${minimumAmount.toFixed(2)}.`
      );
      return;
    }

    if (wantsTaxReceipt && !taxIdOrIc.trim()) {
      setErrorMessage(
        "Your NRIC, passport or SSM number is required for a tax-exemption receipt."
      );
      return;
    }

    setIsProcessing(true);

    try {
      if (targetPet) {
        const result = await createPetSponsorshipAction({
          petId: targetPet.id,
          petName: targetPet.name,
          sponsorName: donorName.trim(),
          sponsorEmail: donorEmail.trim().toLowerCase(),
          sponsorPhone: donorPhone.trim() || undefined,
          tierId: isCustomTier ? "custom" : selectedTier.id,
          tierName: isCustomTier ? "Custom Pet Sponsorship" : selectedTier.name,
          amountMYR: finalAmount,
          frequency,
          paymentMethod,
          taxIdOrIc: wantsTaxReceipt ? taxIdOrIc.trim() || undefined : undefined,
          notes: notes.trim() || undefined,
        });

        if (result.success && result.data) {
          setCompletedCheckout({ type: "sponsorship_pledge", data: result.data });
        } else {
          setErrorMessage(
            safeContributionFailureMessage(
              result.error,
              SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE,
            ),
          );
        }

        return;
      }

      const result = await submitDonationPledgeAction({
        donorName: donorName.trim(),
        donorEmail: donorEmail.trim().toLowerCase(),
        donorPhone: donorPhone.trim() || undefined,
        tierId: isCustomTier ? "custom" : selectedTier.id,
        tierName: isCustomTier ? "Custom Rescue Donation" : selectedTier.name,
        amountMYR: finalAmount,
        frequency,
        wantsTaxReceipt,
        taxIdOrIc: wantsTaxReceipt ? taxIdOrIc.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
      });

      if (result.success && result.data) {
        // `saveDonationReceipt` is deliberately not called. That store holds
        // receipts, and this is a claim reference for money nobody has counted;
        // putting it there would rebuild the confusion this change removed.
        setCompletedCheckout({ type: "donation_pledge", data: result.data });
      } else {
        // No local fallback, deliberately. A receipt number is allocated inside
        // the transaction that writes the Donation row, so one invented here
        // would name a receipt the shelter has no record of — and the donor
        // would file it with LHDN. Report only what this application knows.
        setErrorMessage(
          safeContributionFailureMessage(
            result.error,
            DONATION_RECORDING_UNCONFIRMED_MESSAGE,
          ),
        );
      }
    } catch {
      if (targetPet) {
        setErrorMessage(SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE);
        return;
      }

      setErrorMessage(DONATION_RECORDING_UNCONFIRMED_MESSAGE);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setCompletedCheckout(null);
    setDonorName("");
    setDonorEmail("");
    setDonorPhone("");
    setWantsTaxReceipt(false);
    setTaxIdOrIc("");
    setNotes("");
    setErrorMessage(null);
  };

  return {
    state: {
      selectedTier,
      isCustomTier,
      customAmount,
      frequency,
      paymentMethod,
      donorName,
      donorEmail,
      donorPhone,
      wantsTaxReceipt,
      taxIdOrIc,
      notes,
      copiedBank,
      isProcessing,
      errorMessage,
      completedCheckout,
      finalAmount,
      minimumAmount,
      tiers: SPONSORSHIP_TIERS,
    },
    handlers: {
      setSelectedTier: handleSelectTier,
      setIsCustomTier: handleSelectCustom,
      setCustomAmount,
      setFrequency,
      setPaymentMethod,
      setDonorName,
      setDonorEmail,
      setDonorPhone,
      setWantsTaxReceipt,
      setTaxIdOrIc,
      setNotes,
      handleCopyMaybank,
      handleCompleteDonation,
      handleReset,
    },
  };
}
