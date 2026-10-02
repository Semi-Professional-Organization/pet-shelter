"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, Heart, Home, Milk, ShieldPlus, MessageCircle } from "lucide-react";
import { Section, SectionHeader } from "@/components/layout/Section";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";

/**
 * /adoption — "Adopt or Foster". Fostering follows the same process as adoption
 * (tasks/decisions/2026-10-02-foster-uses-the-adoption-process.md), so both live on one page and
 * the visitor chooses once, at the top, then reads only their branch. The shared three steps
 * (HomeProcessSection, #how-it-works) follow both branches.
 *
 * Foster has no apply form yet: AdoptionApplication has no type field, so the foster CTA stays a
 * WhatsApp message rather than submitting a foster application as an adoption.
 */

// Shared recipes from docs/page-style-guide.md §3 and §5.
const panel = "rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7";
const choiceCard = `group flex flex-col gap-3 transition-colors hover:border-primary/40 ${panel}`;
const cardTitle = "font-heading text-xl font-bold tracking-tight text-foreground";
const cardBody = "text-sm leading-relaxed text-muted-foreground";
const iconTile = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground";
const inlineCta = "mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-bold uppercase tracking-wider text-primary";
const stepsLink = "text-sm font-semibold text-primary hover:underline";
// Not buttonVariants: its default fill would clash with the brand colour (page-style-guide §8.1).
const whatsappButton =
  "inline-flex h-10 items-center gap-2 rounded-control bg-brand-whatsapp px-6 text-xs font-semibold uppercase tracking-widest text-white shadow-brand-xs transition-colors hover:bg-brand-whatsapp-hover";

/** Page title and the single adopt-or-foster choice point. */
export function AdoptOrFosterIntro() {
  const { isMs } = useLanguage();

  const choices = [
    {
      href: "#adopt",
      icon: Home,
      title: isMs ? "Adopsi" : "Adopt",
      body: isMs
        ? "Beri haiwan reskue sebuah rumah kekal."
        : "Give a rescue a permanent home.",
      cta: isMs ? "Cara mengadopsi" : "How adopting works",
    },
    {
      href: "#foster",
      icon: BedDouble,
      title: isMs ? "Asuh" : "Foster",
      body: isMs
        ? "Beri haiwan reskue rumah sementara semasa ia pulih."
        : "Give a recovering rescue a temporary home.",
      cta: isMs ? "Cara mengasuh" : "How fostering works",
    },
  ];

  return (
    <Section>
      <div className="space-y-12">
        <div className="space-y-6">
          <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {isMs ? "Adopsi atau Asuh" : "Adopt or Foster"}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {isMs
              ? "Kedua-duanya 100% percuma dan mengikut proses yang sama. Pilih yang sesuai dengan anda."
              : "Both are 100% free and follow the same process. Choose the one that suits you."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {choices.map((c) => (
            <Link key={c.href} href={c.href} className={choiceCard}>
              <div className={iconTile}>
                <c.icon className="size-5" />
              </div>
              {/* Not a heading: the card is a link to the branch, whose own h2 carries the same name. */}
              <p className="font-heading text-2xl font-bold tracking-tight text-foreground">{c.title}</p>
              <p className={cardBody}>{c.body}</p>
              <span className={inlineCta}>
                {c.cta}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function AdoptBranch() {
  const { isMs } = useLanguage();

  return (
    <Section id="adopt" className="scroll-mt-24">
      <div className="space-y-10">
        <SectionHeader
          title={isMs ? "Adopsi" : "Adopt"}
          subtitle={
            isMs
              ? "Adopsi memberi haiwan reskue sebuah rumah untuk selama-lamanya. Pilih haiwan, hantar permohonan, dan kami akan membantu anda di setiap langkah."
              : "Adopting gives a rescue a home for life. Choose an animal, apply, and we guide you through each step."
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <Link href="/pets" className={buttonVariants({ size: "lg", className: "gap-2" })}>
            <Heart className="size-4 fill-current" />
            {isMs ? "Lihat Haiwan Reskue" : "Meet Our Animals"}
            <ArrowRight className="size-4" />
          </Link>
          <Link href="#how-it-works" className={stepsLink}>
            {isMs ? "Lihat 3 langkah" : "See the 3 steps"}
          </Link>
        </div>
      </div>
    </Section>
  );
}

export function FosterBranch() {
  const { isMs } = useLanguage();

  const kinds = [
    {
      icon: ShieldPlus,
      title: isMs ? "Pemulihan Selepas Pembedahan" : "Post-Op Recovery",
      body: isMs
        ? "7–10 hari rehat yang tenang di dalam rumah sementara luka pembedahan sembuh."
        : "7–10 days of quiet indoor rest while surgical incisions heal.",
    },
    {
      icon: BedDouble,
      title: isMs ? "Asuhan Pengasingan Perubatan" : "Medical Isolation",
      body: isMs
        ? "2–4 minggu untuk rawatan kurap atau pemulihan patah tulang."
        : "2–4 weeks for mange therapy or orthopedic fracture rehabilitation.",
    },
    {
      icon: Milk,
      title: isMs ? "Asuhan Anak Haiwan" : "Neonatal Nursery",
      body: isMs
        ? "Menyusukan dan menjaga anak haiwan yatim sehingga berumur 8 minggu."
        : "Bottle-feeding and caring for orphaned litters until 8 weeks old.",
    },
  ];

  return (
    <Section id="foster" className="scroll-mt-24">
      <div className="space-y-10">
        <SectionHeader
          title={isMs ? "Asuh" : "Foster"}
          subtitle={
            isMs
              ? "Mengasuh memberi haiwan yang lemah rumah yang tenang semasa ia pulih. Kami menyediakan semua makanan, sangkar, ubat dan bil veterinar — anda menyediakan kasih sayang, keselamatan dan pemerhatian."
              : "Fostering gives vulnerable animals a calm home while they recover. We provide all food, crates, medication and vet bills — you provide love, safety and observation."
          }
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {kinds.map((k) => (
            <div key={k.title} className={`${panel} flex flex-col gap-3`}>
              <div className={iconTile}>
                <k.icon className="size-5" />
              </div>
              <h3 className={cardTitle}>{k.title}</h3>
              <p className={cardBody}>{k.body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <a
            href={`https://wa.me/60123456789?text=${encodeURIComponent(
              "Hi Hope for Strays, I am interested in becoming a temporary foster parent."
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={whatsappButton}
          >
            <MessageCircle className="size-4" />
            {isMs ? "WhatsApp Pasukan Asuhan" : "WhatsApp Foster Care Team"}
          </a>
          <Link href="#how-it-works" className={stepsLink}>
            {isMs ? "Lihat 3 langkah" : "See the 3 steps"}
          </Link>
        </div>
      </div>
    </Section>
  );
}

export function AdoptOrFosterCallToAction() {
  const { isMs } = useLanguage();

  return (
    <Section>
      <div className="space-y-6">
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          {isMs ? "Sudah menghantar permohonan?" : "Already applied?"}
        </p>
        <Link href="/applications/track" className={buttonVariants({ size: "lg", variant: "outline" })}>
          {isMs ? "Semak Status Permohonan" : "Track Application Status"}
        </Link>
      </div>
    </Section>
  );
}
