"use client";

import React, { useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { AlertTriangle, Eye, Info, QrCode, ShieldCheck, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QrImageUpload } from "@/components/admin/QrImageUpload";
import { QrPreviewDialog } from "@/components/admin/QrPreviewDialog";
import { ShelterSettingsInput } from "@/lib/validations/settings";
import { QR_PAYLOAD_MAX_LENGTH, renderQrSvg } from "@/lib/domain/qrCode";

/**
 * The "Donation & QR Codes" tab of the admin settings page.
 *
 * Kept out of `settings/page.tsx` because that file already carries three tabs;
 * it takes the parent's form handle so everything still saves through the one
 * existing submit.
 */

interface DonationQrSettingsProps {
  form: UseFormReturn<ShelterSettingsInput>;
  /** False for roles that may read but not write these fields. */
  canEdit: boolean;
}

const QR_FIELDS = [
  {
    name: "duitNowQrUrl" as const,
    label: "DuitNow QR",
    description: "The national QR shown on /donate and every sponsorship modal.",
  },
  {
    name: "tngQrUrl" as const,
    label: "Touch 'n Go eWallet QR",
    description:
      "Optional. Adds a Touch 'n Go tab to the donor panel when set.",
  },
  {
    name: "bankQrUrl" as const,
    label: "Bank Transfer QR",
    description:
      "Optional. Adds a bank-transfer tab to the donor panel when set.",
  },
];

export function DonationQrSettings({ form, canEdit }: DonationQrSettingsProps) {
  const { register, watch, setValue, formState } = form;
  const [previewOpen, setPreviewOpen] = useState(false);

  const duitNowQrUrl = watch("duitNowQrUrl") ?? "";
  const tngQrUrl = watch("tngQrUrl") ?? "";
  const bankQrUrl = watch("bankQrUrl") ?? "";
  const paymentPayload = watch("paymentPayload") ?? "";

  // The toggle must be on whenever a payload exists, or the tab would hide a
  // value that is live on the public site. A `useState` initialiser would read
  // the payload once, before the server hydration lands, and then stay wrong —
  // so track only the admin's explicit choice and derive the rest.
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const autoGenerate = manualToggle ?? paymentPayload.trim() !== "";

  const generated = useMemo(() => {
    const payload = paymentPayload.trim();
    if (!autoGenerate || payload === "") return null;
    try {
      return { svg: renderQrSvg(payload, { title: "Generated donation QR" }), error: null };
    } catch (err) {
      return { svg: null, error: err instanceof Error ? err.message : "Cannot encode payload" };
    }
  }, [autoGenerate, paymentPayload]);

  const uploadOverridesPayload = duitNowQrUrl.trim() !== "" && paymentPayload.trim() !== "";
  const values: Record<string, string> = { duitNowQrUrl, tngQrUrl, bankQrUrl };

  return (
    <div className="border border-border bg-card p-6 sm:p-8 space-y-6 rounded-lg shadow-sm">
      <div className="border-b border-border pb-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <QrCode className="size-4 text-primary-ink" />
          Donation &amp; QR Codes
        </h2>
        <p className="text-xs text-muted-foreground">
          Malaysian donors pay through DuitNow QR, Touch &apos;n Go eWallet, and direct
          bank transfer. These codes appear on every public donation surface.
        </p>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <ShieldCheck className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          <p className="text-3xs leading-relaxed text-muted-foreground">
            Your role can view these settings but not change them. Shelter-wide QR
            codes route every donation on the site, so only an ADMIN may edit them.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {QR_FIELDS.map((field) => (
          <div key={field.name} className="space-y-1">
            <QrImageUpload
              label={field.label}
              description={field.description}
              value={values[field.name]}
              disabled={!canEdit}
              onChange={(url) =>
                setValue(field.name, url, { shouldValidate: true, shouldDirty: true })
              }
            />
            {formState.errors[field.name] && (
              <p className="text-3xs text-destructive font-medium">
                {String(formState.errors[field.name]?.message)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Auto-generation from a payment payload */}
      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="autoGenerateQr" className="text-sm font-semibold flex items-center gap-1.5">
              <Wand2 className="size-3.5 text-primary-ink" />
              Auto-generate a QR from a payment string
            </Label>
            <p className="text-xs text-muted-foreground">
              Paste a DuitNow EMVCo string or a bank payment deep link and we render
              the code ourselves — no image upload needed.
            </p>
          </div>
          <button
            id="autoGenerateQr"
            type="button"
            role="switch"
            aria-checked={autoGenerate}
            disabled={!canEdit}
            onClick={() => {
              const next = !autoGenerate;
              setManualToggle(next);
              // Turning the switch off has to clear the payload, not just hide
              // the field. Otherwise the value is still submitted, still stored,
              // and `resolveDonationQr` still publishes the generated code — so
              // an admin switching off to stop a wrong payment string would see
              // no change on the public site and lose sight of the live value.
              if (!next) {
                setValue("paymentPayload", "", {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              autoGenerate ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
                autoGenerate ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {autoGenerate && (
          <div className="space-y-3 p-4 bg-muted/40 border border-border rounded-lg animate-in">
            <div className="space-y-1.5">
              <Label htmlFor="paymentPayload" className="text-xs font-semibold">
                Payment payload
              </Label>
              <Textarea
                id="paymentPayload"
                rows={3}
                disabled={!canEdit}
                placeholder="00020101021126580014A00000061500010106598888..."
                className="text-xs font-mono"
                {...register("paymentPayload")}
              />
              <div className="flex justify-between gap-3 text-3xs text-muted-foreground">
                <span>
                  {formState.errors.paymentPayload ? (
                    <span className="text-destructive font-medium">
                      {String(formState.errors.paymentPayload.message)}
                    </span>
                  ) : (
                    "Stored as text and re-rendered on every page load."
                  )}
                </span>
                <span className="font-mono shrink-0">
                  {paymentPayload.length}/{QR_PAYLOAD_MAX_LENGTH}
                </span>
              </div>
            </div>

            {generated?.svg && (
              <div className="flex items-center gap-4">
                <div
                  className="size-28 shrink-0 rounded-md border border-receipt-rule bg-white p-1 [&>svg]:w-full [&>svg]:h-full"
                  // Built by renderQrSvg from our own module matrix; the payload
                  // never reaches the markup as text.
                  dangerouslySetInnerHTML={{ __html: generated.svg }}
                />
                <p className="text-3xs text-muted-foreground">
                  Live render of the payload above. Scan it with a banking app to
                  confirm it resolves to the right account before saving.
                </p>
              </div>
            )}

            {generated?.error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-destructive" />
                <p className="text-3xs text-destructive font-medium">{generated.error}</p>
              </div>
            )}

            {uploadOverridesPayload && (
              <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface p-2.5">
                <Info className="size-3.5 shrink-0 mt-0.5 text-warning-text" />
                <p className="text-3xs text-warning-text font-medium">
                  A DuitNow QR image is also uploaded. The uploaded image wins —
                  remove it to publish the generated code instead.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="text-xs"
        >
          <Eye className="size-3.5 mr-1.5" /> Preview donor view
        </Button>
      </div>

      {previewOpen && (
        <QrPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          shelterQrUrl={duitNowQrUrl}
          tngQrUrl={tngQrUrl}
          bankQrUrl={bankQrUrl}
          paymentPayload={paymentPayload}
          shelterName={watch("shelterName") ?? ""}
          dirty={formState.isDirty}
        />
      )}
    </div>
  );
}
