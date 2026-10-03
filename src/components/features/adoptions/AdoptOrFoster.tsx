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
 * Both apply buttons lead to the same animal list, filtered: /pets?type=adopt or ?type=foster
 * (matchesPlacementFilter). The application then starts from the chosen animal.
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
            ? "Adopsi memberi haiwan reskue rumah kekal. Asuhan memberi haiwan reskue yang masih membina keyakinan dengan manusia rumah sementara, di mana ia disosialisasikan dan disediakan untuk diadopsi. Kedua-duanya 100% percuma dan mengikut proses yang sama."
            : "Adopting gives a rescue a permanent home. Fostering gives a rescue that is still building confidence around people a temporary home, where it is socialised and prepared for adoption. Both are 100% free and follow the same process."}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/pets?type=adopt" className={buttonVariants({ size: "lg", className: "gap-2" })}>
          <Heart className="size-4 fill-current" />
          {isMs ? "Mohon untuk Adopsi" : "Apply to Adopt"}
          <ArrowRight className="size-4" />
        </Link>
        {/* Same button, inverted: primary outline and text on the page ground. cn() rather than
            buttonVariants' className, which concatenates without merging (page-style-guide §8.1). */}
        <Link
          href="/pets?type=foster"
          className={cn(
            buttonVariants({ size: "lg", variant: "outline" }),
            "gap-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary dark:bg-transparent dark:hover:bg-primary/10"
          )}
        >
          <Heart className="size-4" />
          {isMs ? "Mohon untuk Asuh" : "Apply to Foster"}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </Section>
  );
}
