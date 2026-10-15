"use client";

import { STATUTORY_ROS_REGISTRATION_NO } from "@/lib/domain/shelterIdentity";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  HeartHandshake,
  QrCode,
  CheckCircle2,
  Copy,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Heart,
  Building2,
  Sparkles,
} from "lucide-react";
import {
  useSponsorshipController,
  UseSponsorshipControllerProps,
} from "@/hooks/useSponsorshipController";
import { DonationQrPanel } from "@/components/features/donations/DonationQrPanel";
import { useDonationQrConfig } from "@/components/providers/DonationQrProvider";

export function SponsorshipModal(props: UseSponsorshipControllerProps) {
  const checkoutIdentity = props.targetPet?.id ?? "general";

  // A closed dialog or a different animal is a different checkout. Remounting
  // the stateful body prevents a previous donor's acknowledgement and PII from
  // resurfacing when the shared gallery/navbar modal is reopened.
  return (
    <SponsorshipModalCheckout
      key={`${checkoutIdentity}:${props.open ? "open" : "closed"}`}
      {...props}
    />
  );
}

function SelectedPaymentInstructions({
  paymentMethod,
  copiedBank,
  onCopyBank,
  petCustomQrUrl,
  petName,
}: {
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  copiedBank: boolean;
  onCopyBank: () => void;
  petCustomQrUrl?: string | null;
  petName?: string;
}) {
  const qrConfig = useDonationQrConfig();

  if (paymentMethod === "duitnow_qr") {
    return (
      <div className="flex justify-center">
        <DonationQrPanel
          compact
          petCustomQrUrl={petCustomQrUrl}
          petName={petName}
          configOverride={{
            ...qrConfig,
            // The modal's radio group is the one source of truth. Suppressing
            // other configured channels prevents the QR panel from presenting
            // a second selector whose choice the submitted payload cannot see.
            tngQrUrl: "",
            bankQrUrl: "",
          }}
          instructions="Scan with Maybank MAE, CIMB, TNG eWallet, Public Bank, etc."
        />
      </div>
    );
  }

  if (paymentMethod === "online_banking") {
    return (
      <div className="space-y-3 text-xs">
        <div className="p-3.5 border border-border bg-card rounded-lg space-y-1">
          <div className="eyebrow flex items-center gap-1">
            <Building2 className="size-3" /> Beneficiary Organization
          </div>
          <div className="font-bold text-foreground text-sm">
            Pertubuhan Kebajikan Hope for Strays
          </div>
          <div className="text-2xs text-muted-foreground">
            ROS Registration: {STATUTORY_ROS_REGISTRATION_NO}
          </div>
        </div>

        <div className="p-3.5 border border-border bg-card rounded-lg space-y-1">
          <div className="eyebrow">Maybank Account Details</div>
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
              onClick={onCopyBank}
              className="h-8 px-3 text-xs font-semibold gap-1.5"
            >
              {copiedBank ? (
                <CheckCircle2 className="size-3.5 text-success-accent" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copiedBank ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <p className="tone-soft tone-warning rounded-lg border p-3 text-xs">
      Card payments are not available. Please choose DuitNow QR or bank transfer.
    </p>
  );
}

function SponsorshipModalCheckout(props: UseSponsorshipControllerProps) {
  const { open, onOpenChange, targetPet } = props;
  const { state, handlers } = useSponsorshipController(props);
  const {
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
    tiers,
  } = state;
  const {
    setSelectedTier,
    setIsCustomTier,
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
  } = handlers;

  const completedPledge =
    completedCheckout?.type === "sponsorship_pledge" ? completedCheckout.data : null;
  const completedGift =
    completedCheckout?.type === "donation_pledge" ? completedCheckout.data : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[92vh] overflow-y-auto p-0 border border-border bg-card shadow-2xl rounded-2xl">
        {/* Header Banner */}
        <div className="bg-primary text-primary-foreground p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider bg-primary-foreground/15 text-primary-foreground rounded-md">
              <HeartHandshake className="size-3.5" />
              Rescue Giving & Sponsorship
            </span>

            {targetPet && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-white/20 px-2.5 py-0.5 rounded-sm">
                <Heart className="size-3 fill-current" />
                Dedicated Pet: {targetPet.name} ({targetPet.breed})
              </span>
            )}
          </div>

          <DialogHeader className="text-left">
            <DialogTitle className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-primary-foreground">
              {targetPet ? `Sponsor ${targetPet.name}'s Recovery` : "Sponsor a Rescue Animal"}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/85 text-sm sm:text-base mt-1.5 max-w-2xl leading-relaxed">
              100% of your contribution funds critical veterinary surgery, core immunisations, and nutrition in Petaling Jaya, Selangor.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 lg:p-9 space-y-7">
          {errorMessage && (
            <div className="bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive font-medium rounded-lg flex items-center gap-2">
              <span>⚠️ {errorMessage}</span>
            </div>
          )}

          {!completedCheckout ? (
            <form onSubmit={handleCompleteDonation} className="space-y-7">
              {/* Frequency Toggle */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-border">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  1. Giving Frequency
                </label>
                <div className="inline-flex p-1 bg-muted rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setFrequency("one_time")}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                      frequency === "one_time"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    One-Time Gift
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrequency("monthly")}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${
                      frequency === "monthly"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <RotateCw className="size-3" />
                    Monthly Rescue Partner
                  </button>
                </div>
              </div>

              {/* 1. Select Sponsorship Tier */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-foreground block">
                    2. Choose Sponsorship Package or Custom Amount
                  </label>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Selected Total: <strong className="text-primary font-mono text-sm">RM {finalAmount.toFixed(2)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {tiers.map((tier) => {
                    const isSelected = !isCustomTier && selectedTier.id === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedTier(tier)}
                        className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary shadow-xs"
                            : "border-border bg-card hover:bg-muted/50"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-heading text-lg font-bold text-foreground">
                              RM {tier.amount}
                            </span>
                            <span className="text-3xs font-bold px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md border border-border">
                              {tier.badgeText}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-foreground line-clamp-1">{tier.name}</div>
                          <div className="text-2xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                            {tier.description}
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-border/60 text-3xs text-primary font-medium">
                          {tier.impactMetrics}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Option */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    isCustomTier
                      ? "border-primary bg-primary/5 ring-2 ring-primary"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        id="customRadio"
                        name="tierOption"
                        checked={isCustomTier}
                        onChange={setIsCustomTier}
                        className="size-4.5 accent-primary"
                      />
                      <label htmlFor="customRadio" className="text-xs font-bold uppercase tracking-wider text-foreground cursor-pointer">
                        Custom Rescue Amount (RM)
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">RM</span>
                      <Input
                        type="number"
                        min={minimumAmount}
                        max="50000"
                        placeholder="e.g. 100"
                        value={customAmount}
                        onFocus={setIsCustomTier}
                        onChange={(e) => {
                          setIsCustomTier();
                          setCustomAmount(e.target.value);
                        }}
                        className="w-32 font-bold font-mono h-9 bg-background"
                      />
                      <span className="text-xs text-muted-foreground">
                        (Min <strong>RM {minimumAmount.toFixed(2)}</strong>)
                      </span>
                    </div>
                  </div>
                </div>

                {/* RM30/mo Rescue Companion Tier Highlights */}
                {(frequency === "monthly" || selectedTier.id === "kibble") && (
                  <div className="border border-primary/30 bg-primary/5 p-4 rounded-xl space-y-2.5">
                    <div className="flex items-center gap-1.5 font-heading text-xs font-bold text-foreground">
                      <Sparkles className="size-3.5 text-primary" />
                      <span>Rescue Companion Perks — {targetPet ? targetPet.name : "Shelter Rescues"}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 bg-background border border-primary/20 rounded-lg space-y-0.5">
                        <span className="font-bold text-foreground text-2xs block">📸 Monthly Updates</span>
                        <span className="text-3xs text-muted-foreground leading-tight block">WhatsApp & Email progress reports</span>
                      </div>
                      <div className="p-2.5 bg-background border border-primary/20 rounded-lg space-y-0.5">
                        <span className="font-bold text-foreground text-2xs block">🏅 Digital Certificate</span>
                        <span className="text-3xs text-muted-foreground leading-tight block">Official e-Certificate of Sponsorship</span>
                      </div>
                      <div className="p-2.5 bg-background border border-primary/20 rounded-lg space-y-0.5">
                        <span className="font-bold text-foreground text-2xs block">🐾 Sanctuary Visits</span>
                        <span className="text-3xs text-muted-foreground leading-tight block">Arranged visiting privileges</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Malaysian Payment Rail (DuitNow QR + Direct Bank Transfer) */}
              <div className="border border-border bg-muted/30 p-5 sm:p-6 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="size-4.5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      3. Official Payment Rail: DuitNow National QR / Maybank Transfer
                    </span>
                  </div>
                  <span className="text-xs font-bold font-mono text-primary bg-primary/10 px-2.5 py-1 rounded-md">
                    Amount: RM {finalAmount.toFixed(2)} {frequency === "monthly" ? "/ month" : ""}
                  </span>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-xs font-bold text-foreground">
                    How will you send this contribution?
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs transition-colors ${
                        paymentMethod === "duitnow_qr"
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        name="sponsorshipPaymentMethod"
                        value="duitnow_qr"
                        checked={paymentMethod === "duitnow_qr"}
                        onChange={() => setPaymentMethod("duitnow_qr")}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span>
                        <strong className="block text-foreground">DuitNow QR</strong>
                        Scan with a Malaysian banking app.
                      </span>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs transition-colors ${
                        paymentMethod === "online_banking"
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        name="sponsorshipPaymentMethod"
                        value="online_banking"
                        checked={paymentMethod === "online_banking"}
                        onChange={() => setPaymentMethod("online_banking")}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span>
                        <strong className="block text-foreground">Bank Transfer</strong>
                        Transfer directly to the Maybank account below.
                      </span>
                    </label>
                  </div>
                </fieldset>

                {targetPet ? (
                  <p className="tone-soft tone-warning rounded-lg border p-3 text-xs leading-relaxed">
                    Record the pledge first. The selected transfer instructions and a unique
                    matching reference appear on the next screen; do not send the transfer before
                    you have that reference.
                  </p>
                ) : (
                  <SelectedPaymentInstructions
                    paymentMethod={paymentMethod}
                    copiedBank={copiedBank}
                    onCopyBank={handleCopyMaybank}
                  />
                )}

                <div className="flex items-center gap-2 text-2xs text-muted-foreground bg-success-surface p-2.5 rounded-md border border-success-accent/20">
                  <ShieldCheck className="size-4 text-success-accent shrink-0" />
                  <span>
                    {targetPet
                      ? "Receipt issuance waits until a coordinator verifies the transfer."
                      : "An official receipt is issued for every recorded gift; tax relief is optional below."}
                  </span>
                </div>
              </div>

              {/* 3. Supporter information and optional tax-relief details */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground block">
                  4. Supporter Details
                </label>

                <div className="tone-soft tone-info flex items-start gap-3 rounded-xl border p-4">
                  <input
                    type="checkbox"
                    id="sponsorshipWantsTaxReceipt"
                    checked={wantsTaxReceipt}
                    onChange={(event) => setWantsTaxReceipt(event.target.checked)}
                    aria-describedby="sponsorshipTaxReceiptHint"
                    className="mt-0.5 size-4.5 accent-primary cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor="sponsorshipWantsTaxReceipt"
                      className="text-sm font-bold cursor-pointer"
                    >
                      I want an official tax-exemption receipt (Subsection 44(6) ITA 1967)
                    </label>
                    <p id="sponsorshipTaxReceiptHint" className="text-xs">
                      {targetPet
                        ? "Requires your NRIC, passport or SSM number. Your receipt is issued only after the shelter verifies the transfer."
                        : "Requires your NRIC, passport or SSM number. Untick to give without a tax identifier - an official receipt is still issued, but it cannot be claimed."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="donorName" className="text-xs font-semibold">
                      Full Name / Corporate Entity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="donorName"
                      required
                      maxLength={100}
                      placeholder="e.g. Rachel Lim / Apex Sdn Bhd"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="donorEmail" className="text-xs font-semibold">
                      Email Address (For confirmation and receipt) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="donorEmail"
                      type="email"
                      required
                      placeholder="rachel.lim@example.com"
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="donorPhone" className="text-xs font-semibold">
                      WhatsApp / Mobile Phone (Optional)
                    </Label>
                    <Input
                      id="donorPhone"
                      maxLength={25}
                      placeholder="012-345 6789"
                      value={donorPhone}
                      onChange={(e) => setDonorPhone(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="taxIdOrIc" className="text-xs font-semibold">
                      NRIC / Passport / SSM No.
                      {wantsTaxReceipt && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      id="taxIdOrIc"
                      required={wantsTaxReceipt}
                      disabled={!wantsTaxReceipt}
                      maxLength={30}
                      placeholder="e.g. 920512-10-5432 / 202101012345"
                      value={taxIdOrIc}
                      onChange={(e) => setTaxIdOrIc(e.target.value)}
                      aria-describedby="sponsorshipTaxReceiptHint"
                      className="font-mono disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="notes" className="text-xs font-semibold">
                      Message of Encouragement to Sanctuary Caregivers (Optional)
                    </Label>
                    <Textarea
                      id="notes"
                      rows={2}
                      maxLength={500}
                      placeholder="Leave a message for our shelter team..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Submit & Cancel */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-5">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing} className="gap-2 font-bold px-7">
                  {targetPet
                    ? isProcessing
                      ? "Recording Sponsorship Pledge..."
                      : `Record Sponsorship Pledge - RM ${finalAmount.toFixed(2)}`
                    : isProcessing
                      ? "Recording Donation Pledge..."
                      : `Record Donation Pledge - RM ${finalAmount.toFixed(2)}`}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </form>
          ) : completedPledge ? (
            /* Pledge acknowledgement. This is deliberately not a receipt: the
               shelter has not matched the transfer against its bank statement. */
            <div className="space-y-6">
              <div
                role="status"
                aria-live="polite"
                className="bg-success-surface border border-success-accent/30 p-4 rounded-xl flex items-start gap-3"
              >
                <CheckCircle2 className="size-5 text-success-accent shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-heading text-sm font-bold text-foreground">
                    Sponsorship pledge recorded
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We recorded your RM {completedPledge.amountMYR.toFixed(2)} commitment for{" "}
                    <strong className="text-foreground">{completedPledge.petName}</strong>. The
                    pledge reference below is your on-screen acknowledgement.
                  </p>
                </div>
              </div>

              <div className="tone-soft tone-warning space-y-3 rounded-xl border p-4">
                <div>
                  <div className="text-3xs font-bold uppercase tracking-wider">Pledge reference</div>
                  <div className="mt-1 font-mono text-base font-bold text-foreground">
                    {completedPledge.pledgeRef}
                  </div>
                </div>
                <p className="text-xs leading-relaxed">
                  Quote this reference in your DuitNow or bank-transfer description so the
                  coordinator can match your payment. If you already transferred, keep it for any
                  follow-up with the shelter.
                </p>
                <p className="text-xs font-semibold leading-relaxed">
                  Receipt issuance follows only after a coordinator verifies the transfer against
                  the shelter bank statement, usually within two working days.
                </p>
              </div>

              <SelectedPaymentInstructions
                paymentMethod={completedPledge.paymentMethod}
                copiedBank={copiedBank}
                onCopyBank={handleCopyMaybank}
                petCustomQrUrl={targetPet?.customQrUrl}
                petName={completedPledge.petName}
              />

              <p className="text-xs text-muted-foreground">
                Status: <strong className="text-foreground">Pending payment verification</strong>.
                This acknowledgement records a commitment; it is not proof that money was received.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
                  <RotateCcw className="size-3.5" />
                  Record Another Pledge
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : completedGift ? (
            /* General-gift acknowledgement. Deliberately not a receipt, and not a
               printable dossier: until 2026-09-22 this branch rendered an official
               Section 44(6) e-Receipt with a live HFS-DON number, issued from the
               donor's word that they had paid. The receipt is now emailed after a
               coordinator matches the transfer. */
            <div className="space-y-6">
              <div
                role="status"
                aria-live="polite"
                className="bg-success-surface border border-success-accent/30 p-4 rounded-xl flex items-start gap-3"
              >
                <CheckCircle2 className="size-5 text-success-accent shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-heading text-sm font-bold text-foreground">
                    Donation pledge recorded
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We recorded your RM {completedGift.amountMYR.toFixed(2)} gift towards{" "}
                    <strong className="text-foreground">{completedGift.tierName}</strong>. The
                    pledge reference below is your on-screen acknowledgement.
                  </p>
                </div>
              </div>

              <div className="tone-soft tone-warning space-y-3 rounded-xl border p-4">
                <div>
                  <div className="text-3xs font-bold uppercase tracking-wider">Pledge reference</div>
                  <div className="mt-1 font-mono text-base font-bold text-foreground">
                    {completedGift.pledgeRef}
                  </div>
                </div>
                <p className="text-xs leading-relaxed">
                  Quote this reference in your DuitNow or bank-transfer description so the
                  coordinator can match your payment. If you already transferred, keep it for any
                  follow-up with the shelter.
                </p>
                <p className="text-xs font-semibold leading-relaxed">
                  {completedGift.reconciliationNotice}
                </p>
              </div>

              <SelectedPaymentInstructions
                paymentMethod={completedGift.paymentMethod}
                copiedBank={copiedBank}
                onCopyBank={handleCopyMaybank}
                petCustomQrUrl={targetPet?.customQrUrl}
                petName={completedGift.targetPetName}
              />

              <p className="text-xs text-muted-foreground">
                Status: <strong className="text-foreground">Pending payment verification</strong>.
                This acknowledgement is not a receipt and cannot be filed for tax relief. Your
                official Section 44(6) receipt is emailed once the transfer is confirmed.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
                  <RotateCcw className="size-3.5" />
                  Make Another Contribution
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
