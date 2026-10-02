"use client";

import { SHELTER_PHONE_TEL, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import React from "react";
import { PhoneCall } from "lucide-react";

import { useLanguage } from "@/components/providers/LanguageProvider";
import { buttonVariants } from "@/components/ui/button";

/**
 * The "call the shelter desk" banner shown under both FAQ surfaces.
 *
 * Shared so the phone number is written once: it was previously written out
 * twice, in the display text and the tel: href of two separate components, so
 * changing it meant four edits and any miss would silently keep dialling the
 * old number. The number itself now comes from `shelterIdentity.ts`, which every
 * other "Call" and WhatsApp link reads too.
 */
export function FaqContactBanner({
  title,
  titleMs,
}: {
  /** Optional heading override; defaults to the generic "still have a question". */
  title?: string;
  titleMs?: string;
}) {
  const { isMs } = useLanguage();

  const heading = isMs
    ? (titleMs ?? "Masih ada soalan?")
    : (title ?? "Still have a question?");

  return (
    <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-border bg-muted/30 p-6 sm:flex-row sm:items-center sm:p-7">
      <div className="space-y-2">
        <p className="font-heading text-xl font-bold tracking-tight text-foreground">{heading}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isMs
            ? "Hubungi meja santuari kami Selasa hingga Ahad, 10:00 pagi – 5:00 petang."
            : "Call our shelter desk Tuesday through Sunday, 10:00 AM – 5:00 PM."}
        </p>
      </div>
      <a
        href={`tel:${SHELTER_PHONE_TEL}`}
        className={buttonVariants({ variant: "outline", className: "shrink-0 gap-2" })}
      >
        <PhoneCall className="size-3.5" />
        {SHELTER_PHONE_DISPLAY}
      </a>
    </div>
  );
}
