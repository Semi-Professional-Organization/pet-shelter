"use client";

import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";
import { Section } from "@/components/layout/Section";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { cn } from "@/lib/utils";

/**
 * /adoption — "Adopt or Foster". Fostering follows the same process as adoption
 * (tasks/decisions/2026-10-02-foster-uses-the-adoption-process.md), so the page explains that one
 * process first (HomeProcessSection) and only then asks the visitor to choose, at the apply buttons.
 *
 * Foster has no apply form yet: AdoptionApplication has no type field, so the foster button stays a
 * WhatsApp message rather than submitting a foster application as an adoption. Adoption applications
 * still start from the animal (the form opens per pet), so "Apply to Adopt" leads to /pets.
 */

/** Page title. Bottom padding is dropped so the steps that follow read as this page's content. */
export function AdoptOrFosterIntro() {
  const { isMs } = useLanguage();

  return (
    <Section className="pb-0 sm:pb-0">
      <div className="space-y-6">
        <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          {isMs ? "Adopsi atau Asuh" : "Adopt or Foster"}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          {isMs
            ? "Adopsi memberi haiwan reskue rumah kekal; asuhan memberi rumah sementara semasa ia pulih. Kedua-duanya 100% percuma dan mengikut proses yang sama."
            : "Adopting gives a rescue a permanent home; fostering gives one a temporary home while it recovers. Both are 100% free and follow the same process."}
        </p>
      </div>
    </Section>
  );
}

/** The choice point: after the process, the visitor picks adopt or foster to apply. */
export function AdoptOrFosterApply() {
  const { isMs } = useLanguage();

  return (
    <Section className="pt-0 sm:pt-0">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/pets" className={buttonVariants({ size: "lg", className: "gap-2" })}>
            <Heart className="size-4 fill-current" />
            {isMs ? "Mohon untuk Adopsi" : "Apply to Adopt"}
            <ArrowRight className="size-4" />
          </Link>
          {/* Same button, inverted: primary outline and text on the page ground. cn() rather than
              buttonVariants' className, which concatenates without merging (page-style-guide §8.1). */}
          <a
            href={`https://wa.me/60123456789?text=${encodeURIComponent(
              "Hi Hope for Strays, I would like to apply to foster."
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "gap-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary dark:bg-transparent dark:hover:bg-primary/10"
            )}
          >
            <Heart className="size-4" />
            {isMs ? "Mohon untuk Asuh" : "Apply to Foster"}
            <ArrowRight className="size-4" />
          </a>
          <Link
            href="/applications/track"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline sm:ml-auto"
          >
            {isMs ? "Semak Status Permohonan" : "Track Application Status"}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isMs
            ? "Permohonan adopsi bermula daripada haiwan yang anda pilih. Permohonan asuhan melalui WhatsApp buat masa ini."
            : "Adoption applications start from the animal you choose. Foster applications are by WhatsApp for now."}
        </p>
      </div>
    </Section>
  );
}
