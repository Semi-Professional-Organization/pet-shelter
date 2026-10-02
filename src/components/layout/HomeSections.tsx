"use client";

import { PUBLIC_ROS_REGISTRATION_NO } from "@/lib/domain/shelterIdentity";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  FileText, 
  Users, 
  HomeIcon, 
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage, useTypedTranslation } from "@/components/providers/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Section, SectionHeader } from "@/components/layout/Section";

/**
 * The gallery's loading fallback, which `src/app/page.tsx` used to render
 * itself. (The view-all link it rendered beside it now sits in the featured
 * `PetGallery`'s own header, a client component that calls `t()` directly.)
 *
 * It lives here because `page.tsx` is a Server Component under
 * `revalidate = 300`, and the reader's language is client state —
 * `LanguageProvider` reads `localStorage`, and its `getServerSnapshot` returns
 * `null`, so a server render can only ever produce English. Reading the
 * language cookie in the page would make it render per request and give up
 * ISR, which is the trade `src/app/api/sponsor/pet-media/[petId]/route.ts`
 * already declined. Moving the literals across the client boundary costs
 * nothing and lets them call `t()`.
 *
 * Like every other Malay string on the site, this switches after hydration: the
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
        "Animals with severe fractures, chronic mange, or trauma are admitted to our Rehabilitation House. Under veterinary supervision, they receive medical care until fully healed.",
      descMs:
        "Haiwan yang cedera parah, menghidap kurap teruk, atau trauma dimasukkan ke Rumah Pemulihan kami untuk rawatan rapi dan terapi pemulihan berterusan.",
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
    <Section id="our-work" className="space-y-14">
      <SectionHeader
        title={isMs ? "Kerja Kami" : "Our Work"}
        subtitle={
          isMs
            ? "Kerja kami berteraskan rawatan berperikemanusiaan, pendidikan, dan kewujudan bersama antara haiwan dan komuniti."
            : "Our work focuses on humane care, education and coexistence between animals and communities."
        }
      />

        {/* Editorial rows: image and copy alternate sides, so each pillar gets a full row
            rather than a third of one and the highlights fit without crushing the body. */}
        <div className="space-y-14">
          {pillars.map((pillar, idx) => (
            <div key={idx} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div
                className={`relative aspect-16/10 overflow-hidden rounded-3xl border border-border bg-work-panel ${
                  idx % 2 ? "lg:order-2" : ""
                }`}
              >
                <Image
                  src={pillar.image}
                  alt={isMs ? pillar.altMs : pillar.altEn}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
              <div className="space-y-4">
                <p className="text-2xs font-bold uppercase tracking-wider text-primary">
                  {isMs ? pillar.categoryMs : pillar.categoryEn}
                </p>
                <h3 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {isMs ? pillar.titleMs : pillar.titleEn}
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {isMs ? pillar.descMs : pillar.descEn}
                </p>
                <div className="space-y-2 pt-1">
                  {(isMs ? pillar.highlightsMs : pillar.highlightsEn).map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm font-medium text-foreground/90">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2">
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
    </Section>
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

  const [lead, second, third, fourth] = actions;
  const big = [lead, third].filter(Boolean);
  const small = [second, fourth].filter(Boolean);
  const cardShell =
    "group flex flex-col overflow-hidden rounded-3xl border border-border bg-work-panel shadow-xs transition-colors hover:border-primary/40";

  const cardBody = (a: (typeof actions)[number], titleSize: string) => (
    <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
      <h3 className={`font-heading ${titleSize} font-bold text-foreground`}>{a.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{a.description}</p>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-bold uppercase tracking-wider text-primary">
        {a.cta}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  );

  return (
    <Section className="space-y-12">
      <SectionHeader
        title={isMs ? "Sertai kami membawa perubahan" : "Join us in making a difference"}
        subtitle={
          isMs
            ? "Sama ada anda mengadopsi, menjadi sukarelawan, menderma atau menaja, setiap tindakan membantu mencipta kehidupan yang lebih baik."
            : "Whether you adopt, volunteer, donate or sponsor, every action helps create better lives."
        }
      />

        {/* Adopt and Donate take the two wide cells; Volunteer and Sponsor stack in the third
            without an image, because at a third of the width a photograph arrives too small to
            read as one and costs the copy the room it needs. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {big.map((a) => (
            <Link key={a.href} href={a.href} className={cardShell}>
              <div className="relative aspect-4/3 w-full bg-work-ground">
                <Image src={a.image} alt={a.alt} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 33vw" />
              </div>
              {cardBody(a, "text-2xl")}
            </Link>
          ))}
          <div className="flex flex-col gap-6">
            {small.map((a) => (
              <Link key={a.href} href={a.href} className={`${cardShell} flex-1`}>
                {cardBody(a, "text-xl")}
              </Link>
            ))}
          </div>
        </div>
    </Section>
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
 * The heading and subtitle read from the dictionary too. They were
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
    <Section id="how-it-works" className="scroll-mt-24">
      <div className="space-y-10">
        <SectionHeader title={t("home.howItWorksTitle")} subtitle={t("home.howItWorksSubtitle")} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="relative flex flex-col justify-between rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7"
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
                  <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">
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
    </Section>
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
    <Section id="mission">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4 space-y-4">
            <SectionHeader
              title={isMs ? "Piawaian Kebajikan & Santuari Haiwan" : "Our Animal Welfare & Sanctuary Standards"}
            />
            <p className="text-sm font-semibold text-muted-foreground">
              {(isMs ? "Persatuan Berdaftar ROS Malaysia: " : "Malaysian Registered Society: ") + PUBLIC_ROS_REGISTRATION_NO}
            </p>
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

          {/* A compliance statement reads more credibly as a document than as four tiles, and
              the rules let each protocol run to whatever length it actually needs. */}
          <dl className="lg:col-span-8">
            {shelterProtocols.map((protocol, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 border-t border-border py-6 sm:grid-cols-3 sm:gap-8">
                <dt className="font-heading text-base font-bold text-foreground">{protocol.title}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">
                  {protocol.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
    </Section>
  );
}
