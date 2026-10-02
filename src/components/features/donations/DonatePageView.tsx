"use client";

import { SHELTER_PHONE_TEL, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import React, { Suspense } from "react";
import Link from "next/link";
import {
  Heart,
  MapPin,
  Clock,
  Phone,
  CheckCircle2,
  Package,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/layout/Section";
import { DonationWidget } from "./DonationWidget";
import { AllocationSummary } from "@/components/features/transparency/AllocationSummary";
import type {
  AllocationSlice,
  ImpactStatRecord,
  TransparencySource,
} from "@/lib/domain/transparency";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";

// Shared recipes from docs/page-style-guide.md §3 and §5.
const panel = "rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7";
const eyebrow = "text-2xs font-bold uppercase tracking-wider text-primary";
const pill = "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground";
const iconTile = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground";

/**
 * Donate page body.
 *
 * Split out of `app/donate/page.tsx` so that route can be a Server Component and
 * render the allocation figures into the HTML. As a client page it would have had
 * to fetch them on mount, costing the section its first paint and hiding it from
 * crawlers.
 */
export function DonatePageView({
  allocation,
  impactStats,
  totalSen,
  source,
}: {
  allocation: AllocationSlice[];
  impactStats: ImpactStatRecord[];
  totalSen: number;
  source: TransparencySource;
}) {
  const { t, isMs } = useLanguage();

  const wishlistCategories = [
    {
      category: isMs ? "Makanan & Nutrisi Haiwan" : "Food & Nutritional Support",
      items: isMs ? [
        "Kibble Kering Anak Anjing & Anak Kucing (Beg belum dibuka)",
        "Kibble Dewasa Anjing & Kucing (Jenama protein tinggi)",
        "Susu tepung anak anjing/kucing (KMR / Esbilac)",
        "Makanan basah pemulihan (Royal Canin / Hills)",
      ] : [
        "Dry Puppy & Kitten Kibble (Unopened bags)",
        "Adult Dog & Cat Kibbles (High protein brands)",
        "KMR or Esbilac powdered puppy/kitten milk",
        "Recovery canned wet food (Royal Canin / Hills)",
      ],
    },
    {
      category: isMs ? "Sanitasi & Bekalan Perubatan" : "Sanitation & Medical Supplies",
      items: isMs ? [
        "Kloroks & disinfektan veterinar (F10)",
        "Pelapik kencing serap cecair pakai buang (Pee pads)",
        "Kasa steril, pembalut luka & sarung tangan pembedahan",
        "Ubat kutu & sengkenit (Frontline / Bravecto)",
      ] : [
        "Clorox & veterinary hospital disinfectants (F10)",
        "Disposable heavy-duty absorbent pee pads",
        "Sterile medical gauze, bandages & surgical gloves",
        "Flea & tick spot-on preventatives (Frontline / Bravecto)",
      ],
    },
    {
      category: isMs ? "Alas Tidur & Keselesaan" : "Bedding, Enrichment & Comfort",
      items: isMs ? [
        "Tuala mandi bersih dan selimut 'fleece'",
        "Mangkuk makanan tahan karat (Stainless steel)",
        "Mainan getah tahan lasak (Kongs) untuk stimulasi minda",
        "Tali cawak nilon 6 kaki & kolar anjing kukuh",
      ] : [
        "Clean bath towels and fleece blankets",
        "Heavy-duty stainless steel dog & cat food bowls",
        "Durable rubber chew toys (Kongs) for kennel enrichment",
        "Standard 6-foot nylon dog leashes & sturdy collars",
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* 1. Title + giving form: one band, so the form reads as this page's content. */}
      <Section>
        <div className="space-y-12">
          <div className="space-y-6">
            <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {isMs ? "Taja & Sumbang" : "Donate & Sponsor"}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              {isMs
                ? "Bantu selamatkan nyawa dan biayai rawatan haiwan terbiar. Setiap ringgit disalurkan terus bagi membiayai pembedahan kecemasan, vaksinasi lengkap, dan makanan berkhasiat di pusat perlindungan Petaling Jaya kami. Berkat keprihatinan anda, 100% haiwan reskue kami diserahkan kepada keluarga angkat secara percuma."
                : "Fuel lifesaving medical care and nutrition for rescued strays. Every ringgit directly supports emergency surgeries, core vaccinations, and wholesome meals at our Petaling Jaya sanctuary. Because of your generosity, 100% of our rescued animals are rehomed through our Free Adoption policy."}
            </p>

            {/* Credentials */}
            <div className="flex flex-wrap items-center gap-3">
              <span className={pill}>
                <Heart className="size-4 text-primary" />
                {isMs ? "Jaminan Adopsi 100% Percuma" : "100% Free Adoption Guarantee"}
              </span>
            </div>

            <Link href="/impact" className={buttonVariants({ variant: "outline", className: "gap-2" })}>
              {isMs ? "Lihat Laporan Impak" : "View impact report"}
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <Suspense
            fallback={
              <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-border bg-work-panel p-12 text-muted-foreground">
                <Loader2 className="size-6 animate-spin mr-2" />
                <span>{isMs ? "Memuatkan borang sumbangan..." : "Loading donation form..."}</span>
              </div>
            }
          >
            <DonationWidget />
          </Suspense>
        </div>
      </Section>

      {/* 2. Financial transparency */}
      <Section>
        <div className="space-y-12">
          <SectionHeader
            title={isMs ? "Ke Mana Sumbangan Anda Disalurkan" : "Where Your Donation Goes"}
            subtitle={
              isMs
                ? "Kami beroperasi dengan ketelusan kewangan yang teliti. Peratusan di bawah dikira secara langsung daripada lejar perbelanjaan kami yang disahkan — setiap catatan disokong invois klinik atau pembekal."
                : "We operate with strict financial transparency. The shares below are computed live from our verified expense ledger — every entry is backed by a clinic or supplier invoice you can ask to inspect."
            }
          />

          {/* Allocation and impact figures are derived from the shared expense
              ledger — the same source /transparency renders. This page used to
              hard-code its own percentages, which drifted from the ledger. */}
          <AllocationSummary
            allocation={allocation}
            impactStats={impactStats}
            totalSen={totalSen}
            source={source}
          />
        </div>
      </Section>

      {/* 3. In-kind giving */}
      <Section>
        <div className="space-y-12">
          <SectionHeader
            title={isMs ? "Senarai Keperluan Pusat Perlindungan" : "Shelter Supplies Wishlist"}
            subtitle={
              isMs
                ? "Ingin menyumbang barangan secara terus? Kami menerima penghantaran makanan yang belum dibuka, bekalan perubatan, dan alas tidur di pusat perlindungan Petaling Jaya kami."
                : "Prefer to donate items directly? We gladly accept physical drop-offs of unopened food, medical supplies, and shelter bedding at our Petaling Jaya sanctuary."
            }
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {wishlistCategories.map((cat, idx) => (
              <div key={idx} className={`${panel} space-y-4`}>
                <div className="flex items-center gap-2.5 border-b border-border pb-3">
                  <div className={iconTile}>
                    <Package className="size-5" />
                  </div>
                  <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">{cat.category}</h3>
                </div>
                <ul className="space-y-2.5">
                  {cat.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-start gap-2 text-sm font-medium text-foreground/90">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Drop-off details */}
          <div className={`${panel} grid grid-cols-1 gap-6 md:grid-cols-3`}>
            <div className="space-y-2">
              <p className={`flex items-center gap-2 ${eyebrow}`}>
                <MapPin className="size-4" /> {isMs ? "Lokasi Penghantaran" : "Drop-off Location"}
              </p>
              <p className="font-heading text-xl font-bold tracking-tight text-foreground">Hope for Strays Sanctuary</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("footer.address", "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia")}
              </p>
            </div>

            <div className="space-y-2">
              <p className={`flex items-center gap-2 ${eyebrow}`}>
                <Clock className="size-4" /> {isMs ? "Waktu Lawatan & Penghantaran" : "Visiting & Drop-off Hours"}
              </p>
              <p className="font-heading text-xl font-bold tracking-tight text-foreground">
                {isMs ? "Selasa – Ahad: 10:00 Pagi – 5:00 Petang" : "Tuesday – Sunday: 10:00 AM – 5:00 PM"}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("footer.closedMondays", "Closed on Mondays for deep sanitisation")}
              </p>
            </div>

            <div className="space-y-2">
              <p className={`flex items-center gap-2 ${eyebrow}`}>
                <Phone className="size-4" /> {isMs ? "Hubungi Terus" : "Direct Contact"}
              </p>
              <a href={`tel:${SHELTER_PHONE_TEL}`} className="block font-mono text-xl font-bold text-foreground hover:underline">
                {SHELTER_PHONE_DISPLAY}
              </a>
              <p className="text-sm text-muted-foreground">info@hopeforstrays.org</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 4. Browse the animals */}
      <Section>
        <div className="space-y-6">
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {isMs ? "Ingin melihat haiwan-haiwan yang sedang anda bantu hari ini?" : "Want to see the animals whose lives you are changing today?"}
          </p>
          <Link href="/pets" className={buttonVariants({ size: "lg", className: "gap-2" })}>
            <Heart className="size-4 fill-current" />
            {isMs ? "Lihat Haiwan Sedia Diadopsi" : "Meet Our Adoptable Animals"}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Section>
    </div>
  );
}
