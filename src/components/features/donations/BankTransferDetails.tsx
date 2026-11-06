"use client";

import { useState } from "react";
import { Building2, CheckCircle2, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  SHELTER_BANK_ACCOUNT,
  SHELTER_WHATSAPP_DISPLAY,
  SHELTER_WHATSAPP_URL,
  type ShelterBankAccount,
} from "@/lib/domain/shelterIdentity";

/**
 * The bank-transfer half of the payment panel, shared by the donate widget and the sponsorship
 * popup so there is one place that prints an account number.
 *
 * Until the shelter confirms an account ({@link SHELTER_BANK_ACCOUNT} is `null`, #252) it shows no
 * number, no holder and no copy button: before the pledge, a note to record it first; after, a
 * WhatsApp link that quotes the pledge `reference`. `account`
 * is a prop only so tests can render the confirmed state; callers leave it out.
 */
export function BankTransferDetails({
  account = SHELTER_BANK_ACCOUNT,
  compact = false,
  className = "",
  reference,
  besideOtherRails = false,
}: {
  account?: ShelterBankAccount | null;
  compact?: boolean;
  className?: string;
  /** The pledge reference, once there is one, so the coordinator can match the chat to it. */
  reference?: string;
  /**
   * True while the panel shows beside other payment options and bank transfer is not the one
   * selected (`/donate` before the donor picks it), so the pre-pledge note also says to choose
   * bank transfer. The popup shows the panel only once bank transfer is chosen.
   */
  besideOtherRails?: boolean;
}) {
  const { t, isMs } = useLanguage();
  const [copied, setCopied] = useState(false);
  // Whole class strings, so Tailwind's scanner sees both.
  const box = compact
    ? "p-3.5 border border-border bg-card rounded-lg"
    : "p-4 border border-border bg-card rounded-xl";

  if (!account) {
    return (
      <div className={`${box} space-y-1.5 text-xs ${className}`}>
        <div className="eyebrow flex items-center gap-1">
          <MessageCircle className="size-3.5" />{" "}
          {t("donations.bankTransferTitle", "Direct Bank Transfer")}
        </div>
        {/*
          No link before the pledge is recorded: a WhatsApp request without an HFS- reference
          gets an account the donor can pay with nothing to quote, which the coordinator then
          cannot match. On /donate this panel sits beside the QR whatever is selected, so it
          also says to pick bank transfer: the pledge screen only offers the link for that rail.
        */}
        {!reference ? (
          <p className="text-foreground leading-relaxed">
            {besideOtherRails
              ? t(
                  "donations.bankDetailsChooseThenPledge",
                  "Choose bank transfer as how you are paying and record your pledge first. You then get a reference to quote on WhatsApp for the account details."
                )
              : t(
                  "donations.bankDetailsAfterPledge",
                  "Record your pledge first. You then get a reference to quote on WhatsApp for the account details."
                )}
          </p>
        ) : (
          <>
            <p className="text-foreground leading-relaxed">
              {t(
                "donations.bankDetailsOnWhatsApp",
                "Contact us on WhatsApp for transfer details."
              )}
            </p>
            <a
              href={`${SHELTER_WHATSAPP_URL}?text=${encodeURIComponent(
                whatsAppRequest(isMs, reference)
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-semibold text-primary-ink hover:underline"
            >
              WhatsApp: {SHELTER_WHATSAPP_DISPLAY}
            </a>
          </>
        )}
      </div>
    );
  }

  // ceiling: the reset timer is not cleared on unmount or a second click, and where
  // navigator.clipboard is missing the button does nothing; hold the timer in a ref and hide the
  // button without a clipboard if either shows up in use (tasks/open, #252).
  const handleCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    // Digits only: banking apps reject the spaces or dashes a statement prints. "Copied!" only
    // once the write has landed, as AdoptionWizard does, so a refused write is not reported as done.
    navigator.clipboard.writeText(account.accountNumber.replace(/\D/g, "")).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      () => setCopied(false)
    );
  };

  return (
    <div className={`space-y-3 text-xs ${className}`}>
      <div className={`${box} space-y-1`}>
        <div className="eyebrow flex items-center gap-1">
          <Building2 className="size-3.5" />{" "}
          {t("donations.accountHolderLabel", "Account Holder")}
        </div>
        <div className="font-bold text-foreground text-sm">{account.accountHolder}</div>
      </div>

      <div className={`${box} space-y-1`}>
        <div className="eyebrow">{t("donations.bankTransferTitle", "Direct Bank Transfer")}</div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="font-mono font-bold text-foreground text-base tracking-wider block">
              {account.accountNumber}
            </span>
            <span className="text-3xs text-muted-foreground">{account.bankName}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-3 text-xs font-semibold gap-1.5 rounded-lg cursor-pointer"
          >
            {copied ? (
              <CheckCircle2 className="size-3.5 text-success-accent" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied
              ? t("donations.copiedBtn", "Copied!")
              : t("donations.copyAccountBtn", "Copy Bank Account")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The pre-filled WhatsApp message asking for the transfer details for a recorded pledge. */
function whatsAppRequest(isMs: boolean, reference: string): string {
  return isMs
    ? `Hai Hope for Strays, boleh hantar butiran pindahan bank untuk ikrar ${reference}?`
    : `Hi Hope for Strays, could you send me the bank transfer details for pledge ${reference}?`;
}
