"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/layout/Section";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";

/**
 * Page title for /adoption. The bottom padding is dropped so the process steps that follow read
 * as this page's content rather than a separate band.
 */
export function AdoptionIntro() {
  const { isMs } = useLanguage();

  return (
    <Section className="pb-0 sm:pb-0">
      <div className="space-y-6">
        <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          {isMs ? "Proses & Syarat Adopsi" : "Adoption Process & Criteria"}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          {isMs
            ? "Adopsi di Hope for Strays adalah 100% percuma. Begini cara kami memadankan setiap haiwan reskue dengan keluarga yang sesuai, dan apa yang kami semak sebelum mereka pulang."
            : "Adoption at Hope for Strays is 100% free. Here is how we match each rescue with the right family, and what we check before they go home."}
        </p>
      </div>
    </Section>
  );
}

export function AdoptionCallToAction() {
  const { isMs } = useLanguage();

  return (
    <Section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Link href="/pets" className={buttonVariants({ size: "lg", className: "gap-2" })}>
          {isMs ? "Lihat Haiwan Reskue" : "Meet Our Animals"}
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/applications/track" className={buttonVariants({ size: "lg", variant: "outline" })}>
          {isMs ? "Semak Status Permohonan" : "Track Application Status"}
        </Link>
      </div>
    </Section>
  );
}
