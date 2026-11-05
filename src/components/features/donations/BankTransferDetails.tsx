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
 * number, no holder and no copy button, only a WhatsApp link for the transfer details. `account`
 * is a prop only so tests can render the confirmed state; callers leave it out.
 */
export function BankTransferDetails({
  account = SHELTER_BANK_ACCOUNT,
  compact = false,
  className = "",
}: {
  account?: ShelterBankAccount | null;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useLanguage();
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
        <p className="text-foreground leading-relaxed">
          {t(
            "donations.bankDetailsOnWhatsApp",
            "Contact us on WhatsApp for transfer details."
          )}
        </p>
        <a
          href={`${SHELTER_WHATSAPP_URL}?text=${encodeURIComponent(
            "Hi Hope for Strays, could you send me the bank transfer details for a donation?"
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block font-semibold text-primary-ink hover:underline"
        >
          WhatsApp: {SHELTER_WHATSAPP_DISPLAY}
        </a>
      </div>
    );
  }

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(account.accountNumber.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className={`space-y-3 text-xs ${className}`}>
      <div className={`${box} space-y-1`}>
        <div className="eyebrow flex items-center gap-1">
          <Building2 className="size-3.5" /> Account Holder
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
