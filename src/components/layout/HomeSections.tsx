"use client";

import { PUBLIC_ROS_REGISTRATION_NO } from "@/lib/domain/shelterIdentity";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  FileText, 
  Users, 
  HomeIcon, 
  ShieldCheck,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage, useTypedTranslation } from "@/components/providers/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * The two strings `src/app/page.tsx` used to render itself.
 *
 * They live here because `page.tsx` is a Server Component under
 * `revalidate = 300`, and the reader's language is client state —
 * `LanguageProvider` reads `localStorage`, and its `getServerSnapshot` returns
 * `null`, so a server render can only ever produce English. Reading the
 * language cookie in the page would make it render per request and give up
 * ISR, which is the trade `src/app/api/sponsor/pet-media/[petId]/route.ts`
 * already declined. Moving the literals across the client boundary costs
 * nothing and lets them call `t()`.
 *
 * Like every other Malay string on the site, these switch after hydration: the
 * **served HTML** is English, because the server cannot know the language. The
 * `<html lang>` attribute takes the same path rather than being simply wrong —
 * `layout.tsx` serves `lang="en"` and `LanguageProvider` corrects
 * `document.documentElement.lang` in an effect — so the mismatch exists only
 * in the server-rendered document, which is what a crawler reads. Closing it
 * means deciding whether `/` gives up ISR, a larger change than this one; it is
 * tracked in `tasks/open/served-html-is-english-whatever-language-the-reader-chose.md`.
 */
export function HomeGalleryLoading() {
  const { t } = useTypedTranslation();

  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="size-6 animate-spin mr-2" />
      <span>{t("home.galleryLoading")}</span>
    </div>
  );
}

export function HomeViewAllPetsLink() {
  const { t } = useTypedTranslation();

  return (
    <div className="flex justify-center pt-6">
      <Link
        href="/pets"
        className={buttonVariants({
          variant: "outline",
          className: "text-sm font-semibold uppercase tracking-wider focus-visible:ring-2 rounded-xl gap-2",
        })}
      >
        {t("home.viewAllPets")}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

/**
 * FE-03: "Our Work" — The 3 Core Pillars of Hope for Strays UM:
 * 1. TNRM (Trap-Neuter-Return-Manage)
 * 2. Education & Campus Coexistence
 * 3. Clinical Rehabilitation & Medical Care
 */
export function HomeOurWorkSection() {
  const { isMs } = useLanguage();

  const pillars = [
    {
      image:
        "https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=900&q=80",
      altEn: "A community cat resting on a pavement",
      altMs: "Kucing komuniti sedang berehat di kaki lima",
      // `/faq` explains TNRM ("Answers on TNRM and community animals"); its
      // category is internal state, so the page is as deep as a link can go.
      // This used to be `/#how-it-works`, the three-step *adoption* journey —
      // harmless while that anchor rendered nowhere, misleading once restored.
      href: "/faq",
      categoryEn: "Population Control",
      categoryMs: "Kawalan Populasi",
      titleEn: "TNRM (Trap-Neuter-Return-Manage)",
      titleMs: "TNRM (Tangkap-Mandul-Lepas-Urus)",
      descEn:
        "Culling fails because of the 'Vacuum Effect' — removing strays invites new fertile animals to colonize the area. Humane TNRM stabilizes colonies, stops breeding cycles, and protects community health.",
      descMs:
        "Penyingkiran haiwan gagal kerana 'Kesan Vakum' — kawasan kosong akan diduduki haiwan jalanan baru yang tidak mandul. TNRM menstabilkan populasi secara saintifik dan berkesan.",
      highlightsEn: [
        "Ear-notching (left ear) for clear identification",
        "Managed feeding stations across UM campus",
        "Rabies & core vaccination upon spay surgery",
      ],
      highlightsMs: [
        "Penandaan telinga kiri (ear-notching) rasmi",
        "Stesen makanan berjadual di sekitar kampus UM",
        "Vaksinasi teras & pencegahan rabies semasa mandul",
      ],
    },
    {
      image:
        "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=900&q=80",
      altEn: "A cat and a dog resting together outdoors",
      altMs: "Seekor kucing dan anjing berehat bersama di luar",
      href: "/get-involved",
      categoryEn: "Community Coexistence",
      categoryMs: "Kewujudan Bersama",
      titleEn: "Education & Coexistence",
      titleMs: "Pendidikan & Harmoni Kampus",
      descEn:
        "Long-term stray welfare requires shifting human perception. We conduct student workshops, bite-prevention campaigns, and advocate for humane campus guidelines across Universiti Malaya.",
      descMs:
        "Kesejahteraan haiwan jalanan bermula dengan pemahaman manusia. Kami menganjurkan bengkel pelajar, kempen keselamatan, dan advokasi polisi kebajikan kampus.",
      highlightsEn: [
        "Campus stray safety & bite prevention seminars",
        "Anti-abandonment and responsible pet ownership",
        "Student volunteer warden & feeding network",
      ],
      highlightsMs: [
        "Seminar keselamatan & pencegahan gigitan haiwan",
        "Kempen anti-pembuangan haiwan peliharaan",
        "Rangkaian skuad sukarelawan & warden pelajar",
      ],
    },
    {
      image:
        "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&w=900&q=80",
      altEn: "A carer gently examining a rescued cat",
      altMs: "Penjaga sedang memeriksa kucing reskue dengan lembut",
      href: "/needs",
      categoryEn: "Clinical Care",
      categoryMs: "Rawatan Klinikal",
      titleEn: "Sanctuary & Rehabilitation",
      titleMs: "Santuari & Rumah Pemulihan",
      descEn:
        "Animals with severe fractures, chronic mange, or trauma are admitted to our Petaling Jaya Rehabilitation House. Under veterinary supervision, they receive medical care until fully healed.",
      descMs:
        "Haiwan yang cedera parah, menghidap kurap teruk, atau trauma dimasukkan ke Rumah Pemulihan Petaling Jaya kami untuk rawatan rapi dan terapi pemulihan berterusan.",
      highlightsEn: [
        "Post-op sterile recovery enclosures & wound care",
        "Medicated baths & demodicosis/sarcoptic therapy",
        "100% free adoptions for cleared animals",
      ],
      highlightsMs: [
        "Kandang pemulihan steril & rawatan luka",
        "Mandian berubat kurap & pemulihan bulu",
        "Adopsi percuma 100% setelah sembuh sepenuhnya",
      ],
    },
  ];

  return (
    <section id="our-work" className="bg-work-ground py-16 sm:py-20">
      <div className="w-full px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="max-w-2xl space-y-3">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            {isMs ? "Kerja Kami" : "Our Work"}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            {isMs
              ? "Kerja kami berteraskan rawatan berperikemanusiaan, pendidikan, dan kewujudan bersama antara haiwan dan komuniti."
              : "Our work focuses on humane care, education and coexistence between animals and communities."}
          </p>
        </div>

        {/* 3 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pillars.map((pillar, idx) => (
            <div
              key={idx}
              className="flex flex-col overflow-hidden rounded-3xl border border-border bg-work-panel shadow-xs"
            >
              <div className="relative aspect-4/3 w-full bg-work-ground">
                <Image
                  src={pillar.image}
                  alt={isMs ? pillar.altMs : pillar.altEn}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                />
              </div>

              <div className="flex flex-1 flex-col gap-4 p-6 sm:p-7">
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-primary">
                    {isMs ? pillar.categoryMs : pillar.categoryEn}
                  </p>
                  <h3 className="mt-1.5 font-heading text-xl font-bold text-foreground">
                    {isMs ? pillar.titleMs : pillar.titleEn}
                  </h3>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isMs ? pillar.descMs : pillar.descEn}
                </p>

                <div className="space-y-2">
                  {(isMs ? pillar.highlightsMs : pillar.highlightsEn).map((item, hIdx) => (
                    <div key={hIdx} className="flex items-start gap-2 text-xs text-foreground/90 font-medium">
                      <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-2">
                  <Link
                    // From the pillar itself, not its position. Choosing by
                    // array index is how the TNRM card came to point at the
                    // adoption steps: reorder the array and every link after
                    // the change would silently point somewhere else.
                    href={pillar.href}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground hover:text-primary transition-colors"
                  >
                    <span>{isMs ? "Lihat cara ini berfungsi" : "See how this works"}</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeQuickActionsSection() {
  const { isMs } = useLanguage();

  const actions = [
    {
      image:
        "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=900&q=80",
      alt: isMs ? "Seekor anjing reskue yang ceria" : "A cheerful rescue dog outdoors",
      title: isMs ? "Adopsi" : "Adopt",
      description: isMs
        ? "Temui haiwan yang sedia untuk perumahan baharu dan hantar permohonan adopsi dengan mudah."
        : "Meet animals ready for a new home and apply to adopt in just a few steps.",
      cta: isMs ? "Lihat Haiwan" : "See Animals",
      href: "/pets",
    },
    {
      image:
        "https://images.unsplash.com/photo-1494947665470-20322015e3a8?auto=format&fit=crop&w=900&q=80",
      alt: isMs ? "Sukarelawan memegang tali beberapa ekor anjing" : "A volunteer walking several dogs on leads",
      title: isMs ? "Sukarelawan" : "Volunteer",
      description: isMs
        ? "Bantu di santuari, lawatan mingguan, dan aktiviti komuniti tanpa pengalaman terdahulu."
        : "Support the sanctuary through weekly care, walking, transport, and community events.",
      cta: isMs ? "Sertai Kami" : "Get Involved",
      href: "/get-involved",
    },
    {
      image:
        "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=900&q=80",
      alt: isMs ? "Mangkuk makanan haiwan di atas lantai kayu" : "A bowl of food on a wooden floor beside a dog",
      title: isMs ? "Derma" : "Donate",
      description: isMs
        ? "Sokong makanan, ubat, operasi dan pemulihan klinikal untuk haiwan yang memerlukan."
        : "Fund food, treatment, surgery, and recovery costs for rescued animals in need.",
      cta: isMs ? "Sokong HFS" : "Support HFS",
      href: "/donate",
    },
    {
      image:
        "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=900&q=80",
      alt: isMs ? "Kucing yang tenang sedang berehat di dalam rumah" : "A settled cat resting indoors",
      title: isMs ? "Taja" : "Sponsor",
      description: isMs
        ? "Taja pemulihan haiwan, rawatan veterinar, dan penjagaan jangka panjang setiap bulan."
        : "Sponsor ongoing care, treatment, and rehabilitation for animals who need longer-term support.",
      cta: isMs ? "Taja Seekor Haiwan" : "Sponsor an Animal",
      href: "/needs",
    },
  ];

  return (
    <section className="bg-work-ground py-16 sm:py-20">
      <div className="w-full px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto space-y-12">
        <div className="max-w-2xl space-y-3">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            {isMs ? "Sertai kami membawa perubahan" : "Join us in making a difference"}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            {isMs
              ? "Sama ada anda mengadopsi, menjadi sukarelawan, menderma atau menaja, setiap tindakan membantu mencipta kehidupan yang lebih baik."
              : "Whether you adopt, volunteer, donate or sponsor, every action helps create better lives."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group flex flex-col overflow-hidden rounded-3xl border border-border bg-work-panel shadow-xs transition-colors hover:border-primary/40`}
            >
              <div className="relative aspect-16/9 w-full bg-work-ground">
                <Image
                  src={action.image}
                  alt={action.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              </div>

              <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
                <h3 className="font-heading text-xl font-bold text-foreground">{action.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{action.description}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-bold uppercase tracking-wider text-primary">
                  {action.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The three-step adoption journey, and the `#how-it-works` anchor.
 *
 * The copy comes from `home.step*` rather than inline ternaries. Those keys
 * exist in both locales and had no reader: `1137d3e` unmounted this section,
 * and the two copies then drifted apart unobserved — the dictionary said
 * "Semak & Hantar Permohonan" where this file said "Pilih Haiwan & Hantar
 * Permohonan". AGENTS.md, "Boundaries and duplication": once two copies have
 * diverged, that is the defect. The copy *lives* in the dictionary, because
 * that is where a translator can reach it.
 *
 * Where it lives did not decide what it says. Step 3 is the case that proved
 * it: the dictionary's "no hidden fees" implied visible fees, and the inline
 * "zero adoption fees" over-promised, since fees are admin-configurable. It now
 * says "no commercial adoption fees" — the qualified claim this section's own
 * subtitle and the standards section below already make. Each string was read
 * against what the organisation states, not settled by which file held it.
 *
 * No English fallback is passed to `t()` — the provider already falls through
 * to the `en` dictionary, so a literal here could only ever be a third copy,
 * unreachable and free to drift.
 *
 * The heading, eyebrow and subtitle read from the dictionary too. They were
 * left inline at first, on the grounds that `home.howItWorksTitle`/`Subtitle`
 * hold different sentences rather than second copies — true, but it left half
 * of one component translator-reachable and half not, which is the same
 * split-source defect one level down. Adopting the keys does change the
 * visible wording; this section had rendered nowhere since `1137d3e`, so there
 * was no shipped copy to preserve, and the dictionary's version names the
 * three-step process the cards below actually show.
 */
export function HomeProcessSection() {
  const { t } = useTypedTranslation();

  const steps: { num: string; titleKey: TranslationKey; descKey: TranslationKey; icon: typeof FileText }[] = [
    {
      num: "01",
      titleKey: "home.step1Title",
      descKey: "home.step1Desc",
      icon: FileText,
    },
    {
      num: "02",
      titleKey: "home.step2Title",
      descKey: "home.step2Desc",
      icon: Users,
    },
    {
      num: "03",
      titleKey: "home.step3Title",
      descKey: "home.step3Desc",
      icon: HomeIcon,
    },
  ];

  return (
    <section id="how-it-works" className="border-t border-border bg-background py-14 sm:py-18 scroll-mt-24">
      <div className="w-full px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto">
        <div className="max-w-2xl mb-10">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
            {t("home.howItWorksEyebrow")}
          </span>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            {t("home.howItWorksTitle")}
          </h2>
          <p className="text-base text-muted-foreground mt-2 leading-relaxed">
            {t("home.howItWorksSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="border border-border bg-card p-6 sm:p-7 relative flex flex-col justify-between rounded-2xl shadow-xs"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {step.num}
                    </span>
                    <div className="flex size-10 items-center justify-center bg-muted text-foreground rounded-xl">
                      <Icon className="size-5" />
                    </div>
                  </div>
                  <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
                    {t(step.titleKey)}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(step.descKey)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function HomeStandardsSection() {
  const { isMs } = useLanguage();

  const shelterProtocols = [
    {
      title: isMs ? "Protokol Veterinar Lengkap" : "Complete Veterinary Protocol",
      description: isMs
        ? "Setiap haiwan menjalani pemeriksaan kesihatan lengkap, pembedahan pemandulan, vaksinasi teras 6-dalam-1 / FVRCP, ubat cacing, dan mikrocip sebelum adopsi."
        : "Every rescue animal undergoes full veterinary health screening, spay/neuter surgery, core vaccinations (6-in-1 / FVRCP), internal deworming, and microchip registration before rehoming.",
    },
    {
      title: isMs ? "Polisi Adopsi Percuma 100%" : "100% Free Adoption Policy",
      description: isMs
        ? "Kami tidak menjual haiwan atau mengenakan yuran adopsi komersial. Penempatan dibuat berdasarkan keserasian gaya hidup dan kebajikan haiwan."
        : "We do not sell animals or charge commercial adoption fees. Rescues are placed into qualified homes purely based on lifestyle compatibility and animal welfare.",
    },
    {
      title: isMs ? "Bimbingan & Jaring Keselamatan" : "Post-Adoption Guidance & Safety Net",
      description: isMs
        ? "Kami menyediakan bimbingan tingkah laku berterusan. Jika situasi hidup pengadopsi berubah, kami mengekalkan polisi pintu terbuka tanpa syarat untuk menerima semula haiwan."
        : "Our team provides ongoing behavioral transition guidance. If an adopter's life circumstances ever change, we maintain an unconditional open-door policy to welcome the animal back.",
    },
    {
      title: isMs ? "Semakan Kediaman & Keselamatan" : "Structured Premise & Lifestyle Review",
      description: isMs
        ? "Kami menyemak kesesuaian asas kediaman (pagar selamat, kelulusan bangunan bertingkat) bagi memastikan persekitaran hidup yang kekal dan selamat."
        : "We verify basic living suitability (landed housing vs high-rise pet guidelines, fenced perimeter safety, and household consensus) to ensure a safe, lasting match.",
    },
  ];

  return (
    <section id="mission" className="bg-work-ground py-16 sm:py-20">
      <div className="w-full px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-work-panel text-secondary-foreground text-xs font-semibold border border-border rounded-md">
              <ShieldCheck className="size-3.5 text-foreground" />
              <span>{(isMs ? "Persatuan Berdaftar ROS Malaysia: " : "Malaysian Registered Society: ") + PUBLIC_ROS_REGISTRATION_NO}</span>
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isMs ? "Piawaian Kebajikan & Santuari Haiwan" : "Our Animal Welfare & Sanctuary Standards"}
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              {isMs
                ? "Beroperasi di Petaling Jaya dan kampus Universiti Malaya sejak 2016, Hope for Strays menyelamat, memulihkan, dan mencari keluarga baru untuk anjing dan kucing terbiar dengan ketelusan klinikal penuh."
                : "Operating across Petaling Jaya and Universiti Malaya campus since 2016, Hope for Strays rescues, rehabilitates, and rehomes homeless dogs and cats with complete clinical transparency."}
            </p>
            <div className="pt-2">
              <Link
                href="/donate"
                className={buttonVariants({
                  size: "sm",
                  className: "text-xs font-semibold uppercase tracking-wider px-5 py-2.5 rounded-xl",
                })}
              >
                {isMs ? "Sokong Santuari Kami" : "Support Our Sanctuary"}
              </Link>
            </div>
          </div>

          {/* Protocol Grid */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {shelterProtocols.map((protocol, idx) => (
              <div key={idx} className="border border-border bg-work-panel p-5 space-y-2 rounded-2xl shadow-xs">
                <h3 className="font-heading text-base font-bold text-foreground">
                  {protocol.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {protocol.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
