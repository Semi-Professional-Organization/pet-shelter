"use client";

import {
  LHDN_TAX_DEDUCTIBLE_REF,
  PUBLIC_ROS_REGISTRATION_NO,
} from "@/lib/domain/shelterIdentity";
import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  QrCode,
  CheckCircle2,
  Copy,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Sparkles,
  Gift,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPONSORSHIP_TIERS } from "@/lib/client/sponsorshipStore";
import { tierAmountFor } from "@/lib/domain/sponsorshipTiers";
import {
  DONATION_RECORDING_UNCONFIRMED_MESSAGE,
  safeContributionFailureMessage,
} from "@/lib/domain/contributionFailure";
import { submitDonationPledgeAction } from "@/actions/donations";
import type { DonationPledgeDTO } from "@/lib/validations/donation";
import { DonationQrPanel } from "@/components/features/donations/DonationQrPanel";
import { useDonationQrConfig } from "@/components/providers/DonationQrProvider";
import { getPublicPets } from "@/actions/pets";
import { SponsorshipTier } from "@/types/sponsorship";
import { Pet } from "@/types/pet";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { PetChooserCarousel } from "./PetChooserCarousel";

interface DonationWidgetProps {
  initialPets?: Pet[];
}

export function DonationWidget({ initialPets = [] }: DonationWidgetProps) {
  const { t, isMs } = useLanguage();
  const searchParams = useSearchParams();

  const urlPetName = searchParams.get("pet");
  const urlSponsorPetId = searchParams.get("sponsorPetId");
  const urlTier = searchParams.get("tier");
  const urlFreq = searchParams.get("freq");

  // No `src/data/pets.json` fallback here: it offered the bundled demo animals on every visit,
  // including ones production does not hold. With no `initialPets`, the effect below loads the
  // catalogue from the server
  // (`tasks/decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`).
  const [pets, setPets] = useState<Pet[]>(initialPets);

  const [frequency, setFrequency] = useState<"one_time" | "monthly">(() => {
    return urlFreq === "monthly" || urlFreq === "one_time" ? urlFreq : "one_time";
  });

  const [selectedTier, setSelectedTier] = useState<SponsorshipTier>(() => {
    if (urlTier) {
      const match = SPONSORSHIP_TIERS.find(
        (t) => t.id.toLowerCase() === urlTier.toLowerCase()
      );
      if (match) return match;
    }
    return SPONSORSHIP_TIERS[1]; // Default RM 50 Vaccine
  });

  const [selectedPet, setSelectedPet] = useState<Pet | null>(() => {
    if (urlSponsorPetId || urlPetName) {
      return (
        initialPets.find(
          (p) =>
            (urlSponsorPetId && p.id === urlSponsorPetId) ||
            (urlPetName && p.name.toLowerCase() === urlPetName.toLowerCase())
        ) || null
      );
    }
    return null;
  });

  const [targetPetName, setTargetPetName] = useState(() => {
    if (urlPetName) return urlPetName;
    if (urlSponsorPetId) {
      const p = initialPets.find((pet) => pet.id === urlSponsorPetId);
      if (p) return p.name;
    }
    return "";
  });

  const [isCustomTier, setIsCustomTier] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>("100");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [taxIdOrIc, setTaxIdOrIc] = useState("");
  // Unticked by default, which is the conservative reading of what this form used
  // to do. It *displayed* the tax identifier as required and *accepted* its absence,
  // so the two readings disagree — and only one of them can be preserved. Honouring
  // the marker would newly block every donor who until now completed this form with
  // a name and an email, turning a cosmetic defect into a funding one. Honouring the
  // behaviour blocks nobody and adds a way to opt in. `DonationReceiptIntegrity`
  // pins the first reading: name plus email is a complete gift.
  const [wantsTaxReceipt, setWantsTaxReceipt] = useState(false);
  const [notes, setNotes] = useState("");
  const [copiedBank, setCopiedBank] = useState(false);
  const qrConfig = useDonationQrConfig();
  // What the donor says they are paying with. Until 2026-10-13 this form sent
  // `duitnow_qr` for every gift while publishing the Maybank account beside the
  // QR, so a bank-transfer donor was recorded on the wrong rail — on their receipt,
  // and in the coordinator's queue, where it is the hint for which line of the
  // bank statement to match. It is still a self-report; the statement is the
  // authority. But it should at least be the donor's answer and not ours.
  const [paymentMethod, setPaymentMethod] = useState<"duitnow_qr" | "online_banking">(
    "duitnow_qr"
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A pledge, never a receipt. `useSponsorshipStore.saveDonationReceipt` is
  // deliberately not called here: that store's own module comment says a number
  // which never went through Postgres "is not a receipt — it is a string that looks
  // like one", and an HFS-GFT reference is not a receipt number at all.
  const [completedPledge, setCompletedPledge] = useState<DonationPledgeDTO | null>(null);

  // Fetch public pets if not supplied initially
  useEffect(() => {
    if (pets.length === 0) {
      getPublicPets().then((loadedPets) => {
        if (loadedPets && loadedPets.length > 0) {
          setPets(loadedPets);
          if (!selectedPet && (urlSponsorPetId || urlPetName)) {
            const match = loadedPets.find(
              (p) =>
                (urlSponsorPetId && p.id === urlSponsorPetId) ||
                (urlPetName && p.name.toLowerCase() === urlPetName.toLowerCase())
            );
            if (match) {
              setSelectedPet(match);
              setTargetPetName(match.name);
            }
          }
        }
      }).catch((err) => {
        // The chooser stays empty and the gift goes to general care; not worth an error banner.
        console.error("[Donation Widget] Could not load the animals to choose from:", err);
      });
    }
  }, [pets.length, selectedPet, urlPetName, urlSponsorPetId]);

  // Tier prices differ by frequency, so the payable amount follows the toggle
  // rather than the one-time list price.
  const finalAmount = isCustomTier
    ? Math.max(5, Number(customAmount) || 5)
    : tierAmountFor(selectedTier, frequency);

  const handleSelectPet = (pet: Pet | null) => {
    setSelectedPet(pet);
    setTargetPetName(pet ? pet.name : "");
  };

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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!donorName.trim() || !donorEmail.trim()) {
      setErrorMessage(
        isMs
          ? "Sila masukkan nama dan alamat emel anda untuk menerima resit rasmi."
          : "Please enter your name and email address to receive your official tax receipt."
      );
      return;
    }

    if (finalAmount < 5) {
      setErrorMessage(
        isMs
          ? "Jumlah sumbangan minimum ialah RM 5.00."
          : "Minimum donation amount is RM 5.00."
      );
      return;
    }

    setIsProcessing(true);

    const payload = {
      donorName: donorName.trim(),
      donorEmail: donorEmail.trim().toLowerCase(),
      donorPhone: donorPhone.trim() || undefined,
      tierId: isCustomTier ? "custom" : selectedTier.id,
      tierName: isCustomTier
        ? isMs
          ? "Sumbangan Reskue Tersuai"
          : "Custom Rescue Donation"
        : selectedTier.name,
      amountMYR: finalAmount,
      frequency,
      targetPetName: targetPetName.trim() || undefined,
      wantsTaxReceipt,
      // Sent only when the donor asked for a claimable receipt. Otherwise the
      // identifier they may have typed before unticking the box is dropped rather
      // than stored, because a tax number the donor withdrew is not ours to keep.
      taxIdOrIc: wantsTaxReceipt ? taxIdOrIc.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
      paymentMethod,
    };

    try {
      const result = await submitDonationPledgeAction(payload);

      if (result.success && result.data) {
        setCompletedPledge(result.data);
      } else {
        // See the note in useSponsorshipController: a receipt number that never
        // passed through the ledger is not a receipt.
        setErrorMessage(
          safeContributionFailureMessage(
            result.error,
            DONATION_RECORDING_UNCONFIRMED_MESSAGE,
          ),
        );
      }
    } catch {
      setErrorMessage(DONATION_RECORDING_UNCONFIRMED_MESSAGE);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setCompletedPledge(null);
    setPaymentMethod("duitnow_qr");
    setSelectedPet(null);
    setTargetPetName("");
    setDonorName("");
    setDonorEmail("");
    setDonorPhone("");
    setTaxIdOrIc("");
    // Cleared alongside the identifier, never on its own. Leaving the box ticked
    // while wiping the value it requires blocks the next submission on a field the
    // donor did not knowingly re-opt into.
    setWantsTaxReceipt(false);
    setNotes("");
    setErrorMessage(null);
  };

  if (completedPledge) {
    return (
      <div className="border border-border bg-card p-6 sm:p-10 rounded-2xl shadow-sm space-y-6">
        <div className="bg-success-surface border border-success-accent/30 p-5 rounded-xl flex items-start gap-3.5">
          <CheckCircle2 className="size-6 text-success-accent shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              {isMs
                ? "Terima Kasih! Ikrar Sumbangan Anda Telah Direkodkan."
                : "Thank You! Your Donation Pledge Has Been Recorded."}
            </h3>
            {/*
              Deliberately not "received". Nothing has looked at a bank statement at
              this point — the donor was shown a DuitNow QR and told us they paid.
              Until 2026-09-22 this screen said "Your Donation Has Been Received" and
              printed an official Section 44(6) e-Receipt beneath it, which meant a
              supporter who had sent nothing walked away holding a filable tax
              document. There is no receipt on this screen because none exists yet.
            */}
            <p className="text-sm text-muted-foreground mt-1">
              {isMs
                ? `Kami telah merekodkan ikrar RM ${completedPledge.amountMYR.toFixed(2)} anda. Resit cukai rasmi dikeluarkan selepas penyelaras kami memadankan pemindahan anda.`
                : `We have recorded your pledge of RM ${completedPledge.amountMYR.toFixed(2)}. Your official tax receipt is issued once our coordinator matches your transfer.`}
            </p>
          </div>
        </div>

        <div className="border border-border rounded-xl p-6 sm:p-8 space-y-5 bg-background">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                {isMs ? "Rujukan Ikrar Anda" : "Your Pledge Reference"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isMs
                  ? "Sila catatkan rujukan ini dalam keterangan pemindahan anda."
                  : "Please quote this reference in your transfer description."}
              </p>
            </div>
            <div className="text-left sm:text-right">
              {/*
                A claim reference, not a receipt number. The `HFS-GFT` prefix exists
                so a donor cannot mistake this for the `HFS-DON` series, and so a
                coordinator reading a bank statement can tell which queue it belongs
                to at a glance.
              */}
              <span className="tone-chip tone-warning">
                {isMs ? "Menunggu Pembayaran" : "Pending payment"}
              </span>
              <div className="font-mono text-base font-bold text-foreground mt-1">
                {completedPledge.pledgeRef}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-3xs uppercase font-bold text-muted-foreground">
                {isMs ? "Direkodkan Untuk" : "Recorded For"}
              </div>
              <div className="font-bold text-foreground text-sm">
                {completedPledge.donorName}
              </div>
              <div className="text-muted-foreground">{completedPledge.donorEmail}</div>
            </div>

            <div>
              <div className="text-3xs uppercase font-bold text-muted-foreground">
                {isMs ? "Peruntukan" : "Allocation"}
              </div>
              <div className="font-bold text-foreground text-sm">
                {completedPledge.tierName}
              </div>
              {completedPledge.targetPetName && (
                <div className="text-muted-foreground font-medium">
                  🐾 {isMs ? "Dedikasi Haiwan" : "Dedicated Pet"}:{" "}
                  {completedPledge.targetPetName}
                </div>
              )}
              <div className="text-muted-foreground uppercase text-3xs">
                {completedPledge.frequency.replace("_", " ")}
              </div>
            </div>
          </div>

          <div className="border-t border-b border-border py-3 flex items-center justify-between font-heading">
            <span className="text-sm font-bold text-foreground">
              {isMs ? "Jumlah Diikrarkan" : "Amount Pledged"}
            </span>
            <span className="text-2xl font-extrabold text-foreground">
              RM {completedPledge.amountMYR.toFixed(2)}
            </span>
          </div>

          <div className="tone-soft tone-warning rounded-xl border p-4 text-xs leading-relaxed">
            <strong>{isMs ? "Apa yang berlaku seterusnya" : "What happens next"}</strong>
            <br />
            {completedPledge.reconciliationNotice}
          </div>

          {/*
            Stated plainly rather than merely omitted. A donor who has given to this
            shelter before has had a printable Section 44(6) dossier on this screen,
            and silence about the change reads as a missing feature rather than as a
            deliberate boundary.
          */}
          <p className="text-3xs text-muted-foreground leading-relaxed italic">
            *{" "}
            {isMs
              ? "Ini bukan resit dan ia tidak boleh difailkan untuk potongan cukai. Resit rasmi Seksyen 44(6) anda akan dihantar melalui e-mel selepas pembayaran anda disahkan."
              : "This is not a receipt and cannot be filed for a tax deduction. Your official Section 44(6) receipt is emailed to you once your payment has been confirmed."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 cursor-pointer rounded-xl"
          >
            <RotateCcw className="size-3.5" />
            {isMs ? "Buat Sumbangan Lain" : "Make Another Donation"}
          </Button>

          {/*
            No print button. The only thing worth printing was the receipt dossier,
            and printing a claim reference invites a donor to file it as one.
          */}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card p-6 sm:p-8 lg:p-10 rounded-2xl shadow-sm space-y-8">
      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive font-medium rounded-xl flex items-center gap-2">
          <span>⚠️ {errorMessage}</span>
        </div>
      )}

      {/* 1. Giving Frequency */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              1. {isMs ? "Pilih Kekerapan Sumbangan" : "Choose Giving Frequency"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isMs
                ? "Pilih sumbangan sekali sahaja atau sertai keluarga penaja bulanan kami."
                : "Select one-time support or join our monthly recurring rescue circle."}
            </p>
          </div>

          <div className="inline-flex p-1 bg-muted rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setFrequency("one_time")}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                frequency === "one_time"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("donations.frequencyOneTime", "One-Time Gift")}
            </button>
            <button
              type="button"
              onClick={() => setFrequency("monthly")}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                frequency === "monthly"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <RotateCw className="size-3.5" />
              {t("donations.frequencyMonthly", "Monthly Rescue Hero")}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Pet Chooser Carousel (FE-06) */}
      <div className="border-b border-border pb-6">
        <PetChooserCarousel
          pets={pets}
          selectedPetId={selectedPet ? selectedPet.id : "general"}
          onSelectPet={handleSelectPet}
        />
      </div>

      {/* 3. Select Tier or Custom Amount */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-bold text-foreground">
            3. {t("donations.selectTierLabel", "Choose Sponsorship Tier or Amount")}
          </h3>
          <span className="text-xs font-semibold text-muted-foreground">
            {isMs ? "Dipilih:" : "Selected:"}{" "}
            <strong className="text-primary font-mono text-sm">
              RM {finalAmount}.00 {frequency === "monthly" ? (isMs ? "/ bln" : "/ mo") : ""}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SPONSORSHIP_TIERS.map((tier) => {
            const isSelected = !isCustomTier && selectedTier.id === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => handleSelectTier(tier)}
                className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary shadow-sm"
                    : "border-border bg-background hover:bg-muted/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="font-heading text-xl font-bold text-foreground">
                      RM {tierAmountFor(tier, frequency)}
                    </span>
                    <span className="text-3xs font-bold px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md border border-border">
                      {tier.badgeText}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {tier.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {tier.description}
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-border/60 text-xs text-primary font-medium">
                  {tier.impactMetrics}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Amount Entry */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isCustomTier
              ? "border-primary bg-primary/5 ring-2 ring-primary"
              : "border-border bg-background hover:bg-muted/20"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <input
                type="radio"
                id="widgetCustomRadio"
                name="widgetTierOption"
                checked={isCustomTier}
                onChange={handleSelectCustom}
                className="size-4.5 accent-primary cursor-pointer"
              />
              <div>
                <label
                  htmlFor="widgetCustomRadio"
                  className="text-sm font-bold text-foreground cursor-pointer"
                >
                  {t("donations.customAmountLabel", "Or Enter Custom Amount (MYR)")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {isMs
                    ? "Tentukan sebarang jumlah melebihi RM 5.00"
                    : "Specify any amount above RM 5.00"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-foreground">RM</span>
              <Input
                type="number"
                min="5"
                max="100000"
                placeholder="100"
                value={customAmount}
                onFocus={handleSelectCustom}
                onChange={(e) => {
                  handleSelectCustom();
                  setCustomAmount(e.target.value);
                }}
                className="w-36 font-bold font-mono h-10 bg-background text-base rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* RM30/mo Rescue Companion Tier Highlights (FE-06) */}
        {(frequency === "monthly" || selectedTier.id === "kibble") && (
          <div className="border border-primary/30 bg-primary/5 p-4 sm:p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="font-heading text-sm font-bold text-foreground">
                {t("donations.companionTierTitle", "Rescue Companion & Updates")} — {selectedPet ? selectedPet.name : (isMs ? "Haiwan Perlindungan" : "Shelter Rescues")}
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-0.5">
                <span className="font-bold text-foreground text-2xs block">
                  📸 {isMs ? "Kemas Kini Bulanan" : "Monthly Care Reports"}
                </span>
                <span className="text-3xs text-muted-foreground leading-tight block">
                  {t("donations.perkMonthlyUpdates", "Monthly Photo & Video Progress Report")}
                </span>
              </div>

              <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-0.5">
                <span className="font-bold text-foreground text-2xs block">
                  🏅 {isMs ? "Sijil Penajaan" : "Digital Certificate"}
                </span>
                <span className="text-3xs text-muted-foreground leading-tight block">
                  {t("donations.perkDigitalCertificate", "Personalized Digital Sponsorship Certificate")}
                </span>
              </div>

              <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-0.5">
                <span className="font-bold text-foreground text-2xs block">
                  🐾 {isMs ? "Lawatan Santuari" : "Sanctuary Visits"}
                </span>
                <span className="text-3xs text-muted-foreground leading-tight block">
                  {t("donations.perkSanctuaryVisits", "Invitation to arrange occasional visits")}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Malaysian Payment Rail Standard */}
      <div className="border border-border bg-muted/30 p-6 sm:p-7 rounded-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" />
            <h3 className="font-heading text-base font-bold text-foreground">
              4.{" "}
              {isMs
                ? "Kaedah Pembayaran Malaysia: DuitNow QR / Pindahan Bank"
                : "Malaysian Payment Rail: DuitNow National QR / Maybank Transfer"}
            </h3>
          </div>
          <span className="text-xs font-bold font-mono text-primary bg-primary/10 px-3 py-1 rounded-md">
            Pay: RM {finalAmount}.00{" "}
            {frequency === "monthly" ? (isMs ? "/ bulan" : "/ month") : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* DuitNow QR — shared with the pet sponsorship modal */}
          <DonationQrPanel
            className="md:col-span-5"
            // The question below is the one source of truth for how the donor
            // paid, exactly as the radio group is in the sponsorship modal, so the
            // panel is given no other channels to offer. Its switcher would be a
            // second selector the submitted payload cannot see, and the payload
            // has no value for a wallet payment in any case: a Touch 'n Go gift
            // would be receipted as DuitNow whatever the donor picked.
            //
            // ceiling: `/donate` therefore shows only the DuitNow code, even when
            // the shelter has uploaded TNG and bank QR images. Offering them here
            // needs a payment-method value for each, on the pledge, the receipt
            // and the coordinator's queue — not a tab.
            configOverride={{ ...qrConfig, tngQrUrl: "", bankQrUrl: "" }}
            instructions={t(
              "donations.duitNowInstructions",
              "Scan using Maybank MAE, CIMB Clicks, Touch 'n Go eWallet, Public Bank, or any Malaysian banking app."
            )}
          />

          {/* Account Details */}
          <div className="md:col-span-7 space-y-3.5 text-xs">
            <div className="p-4 border border-border bg-card rounded-xl space-y-1.5">
              <div className="eyebrow flex items-center gap-1">
                <Building2 className="size-3.5" /> Beneficiary Organization
              </div>
              <div className="font-bold text-foreground text-sm">
                Pertubuhan Kebajikan Hope for Strays
              </div>
              <div className="text-2xs text-muted-foreground">
                ROS Reg: {PUBLIC_ROS_REGISTRATION_NO}
              </div>
            </div>

            <div className="p-4 border border-border bg-card rounded-xl space-y-2">
              <div className="eyebrow">
                Maybank Corporate Current Account
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-foreground text-base tracking-wider block">
                    5140 1234 5678
                  </span>
                  <span className="text-3xs text-muted-foreground">
                    Malayan Banking Berhad (PJ Branch)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyMaybank}
                  className="h-8 px-3 text-xs font-semibold gap-1.5 rounded-lg cursor-pointer"
                >
                  {copiedBank ? (
                    <CheckCircle2 className="size-3.5 text-success-accent" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copiedBank
                    ? t("donations.copiedBtn", "Copied!")
                    : t("donations.copyAccountBtn", "Copy")}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-success-surface p-3 rounded-xl border border-success-accent/30">
              <ShieldCheck className="size-4 text-success-accent shrink-0" />
              <span>
                Official LHDN Tax-Exempt Reference:{" "}
                <strong className="text-success-text ">
                  {LHDN_TAX_DEDUCTIBLE_REF}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/*
          Asked, not assumed. Both rails are on screen above, so the form cannot
          know which one the donor used unless they say. Native radios, the same
          control the sponsorship modal uses for the same question, so arrow keys
          and a single tab stop come from the platform.
        */}
        <fieldset className="border-t border-border pt-4 space-y-2">
          <legend className="text-xs font-bold text-foreground">
            {isMs ? "Bagaimana anda membayar?" : "How are you paying?"}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                [
                  "duitnow_qr",
                  "DuitNow QR",
                  isMs ? "Imbas dengan aplikasi perbankan Malaysia." : "Scan with a Malaysian banking app.",
                ],
                [
                  "online_banking",
                  isMs ? "Pindahan Bank Terus" : "Direct Bank Transfer",
                  isMs ? "Pindahkan terus ke akaun Maybank di atas." : "Transfer to the Maybank account above.",
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs transition-colors ${
                  paymentMethod === value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="donationPaymentMethod"
                  value={value}
                  checked={paymentMethod === value}
                  onChange={() => setPaymentMethod(value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <strong className="block text-foreground">{label}</strong>
                  {hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* 5. Official Donor Dossier Form */}
      <form onSubmit={handleFormSubmit} className="space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              5. {isMs ? "Maklumat Penderma (Untuk e-Resit Rasmi LHDN)" : "Donor Details (For Official Tax-Exempt e-Receipt)"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "donations.taxReliefNoticeDesc",
                "Provide your Full Name and Malaysian IC / Passport / SSM number to receive an official e-Receipt valid for tax deductions."
              )}
            </p>
          </div>

          {/* Section 44(6) opt-in. This gates the tax identifier rather than the
              receipt: a receipt is issued for every gift either way, because the
              ledger is the shelter's complete record of money received and a
              donation the series never saw would be worse than one that cannot be
              claimed. See the superRefine in `src/lib/validations/donation.ts`. */}
          <div className="tone-soft tone-info flex items-start gap-3 rounded-2xl border p-4">
            <input
              type="checkbox"
              id="widgetWantsTaxReceipt"
              checked={wantsTaxReceipt}
              onChange={(e) => setWantsTaxReceipt(e.target.checked)}
              className="mt-0.5 size-4.5 accent-primary cursor-pointer"
            />
            <div className="space-y-0.5">
              <label
                htmlFor="widgetWantsTaxReceipt"
                className="text-sm font-bold cursor-pointer"
              >
                {isMs
                  ? "Saya mahu resit pengecualian cukai rasmi (Subseksyen 44(6) ACP 1967)"
                  : "I want an official tax-exemption receipt (Subsection 44(6) ITA 1967)"}
              </label>
              <p id="widgetTaxReceiptHint" className="text-xs">
                {isMs
                  ? "Memerlukan No. Kad Pengenalan, Pasport atau SSM anda. Nyahtanda untuk menderma tanpa memberikan pengenalan cukai — resit tetap dikeluarkan, cuma tidak boleh dituntut."
                  : "Requires your NRIC, passport or SSM number. Untick to give without providing a tax identifier — a receipt is still issued, it simply cannot be claimed."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="widgetDonorName" className="text-xs font-semibold">
                {t("donations.donorNameLabel", "Donor Full Name *")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="widgetDonorName"
                required
                placeholder="e.g. Nurul Huda binti Ahmad / Apex Logistics Sdn Bhd"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="widgetDonorEmail" className="text-xs font-semibold">
                {t("donations.donorEmailLabel", "Email Address *")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="widgetDonorEmail"
                type="email"
                required
                placeholder="nurul.huda@example.com"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="widgetDonorPhone" className="text-xs font-semibold">
                {t("donations.donorPhoneLabel", "Phone Number (WhatsApp receipt updates)")}
              </Label>
              <Input
                id="widgetDonorPhone"
                placeholder="012-345 6789"
                value={donorPhone}
                onChange={(e) => setDonorPhone(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="widgetTaxIdOrIc" className="text-xs font-semibold">
                {t("donations.donorIcLabel", "Malaysian IC / Passport / SSM Company No.")}
                {wantsTaxReceipt && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id="widgetTaxIdOrIc"
                // The browser blocks the empty case before the round trip; the
                // `superRefine` in donationPledgeSchema is the authority, because a
                // required attribute is advice a caller can ignore.
                required={wantsTaxReceipt}
                disabled={!wantsTaxReceipt}
                placeholder="e.g. 920512-10-5432 / 202101012345"
                value={taxIdOrIc}
                onChange={(e) => setTaxIdOrIc(e.target.value)}
                aria-describedby="widgetTaxReceiptHint"
                className="rounded-xl font-mono disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="widgetNotes" className="text-xs font-semibold">
                {t("donations.donorNotesLabel", "Special Message / Donor Wishes (Optional)")}
              </Label>
              <Textarea
                id="widgetNotes"
                rows={2}
                placeholder="Leave a message for our shelter team..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            {t(
              "donations.taxReliefNoticeTitle",
              "LHDN Tax Exemption (Subsek 44(6) ACP 1967)"
            )}
          </div>

          <Button
            type="submit"
            disabled={isProcessing}
            size="lg"
            className="gap-2 font-bold px-8 rounded-xl cursor-pointer shadow-xs"
          >
            <Gift className="size-4" />
            {isProcessing
              ? t("donations.pledgeProcessing", "Recording Tax-Deductible Pledge...")
              : `${t("donations.pledgeBtn", "Complete Donation Pledge")} — RM ${finalAmount}`}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
