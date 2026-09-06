"use client";

import { LHDN_TAX_DEDUCTIBLE_REF, PUBLIC_ROS_REGISTRATION_NO, SHELTER_PHONE_TEL, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import React, { Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Heart,
  MapPin,
  Clock,
  Phone,
  HelpCircle,
  CheckCircle2,
  Package,
  Award,
  ArrowRight,
  HeartHandshake,
  Loader2,
} from "lucide-react";
import { DonationWidget } from "./DonationWidget";
import { AllocationSummary } from "@/components/features/transparency/AllocationSummary";
import type {
  AllocationSlice,
  ImpactStatRecord,
  TransparencySource,
} from "@/lib/domain/transparency";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";

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

  const faqs = [
    {
      q: isMs ? "Adakah sumbangan saya layak mendapat potongan cukai di Malaysia?" : "Is my contribution tax-deductible in Malaysia?",
      a: isMs
        ? "Ya! Pertubuhan Kebajikan Hope for Strays merupakan organisasi kebajikan yang diluluskan pengecualian cukai di bawah Seksyen 44(6) Akta Cukai Pendapatan 1967 (No. Rujukan Kelulusan: " + LHDN_TAX_DEDUCTIBLE_REF + "). Semua sumbangan tunai layak untuk potongan cukai rasmi individu dan korporat."
        : "Yes! Pertubuhan Kebajikan Hope for Strays is an approved tax-exempt non-profit organisation under Subsection 44(6) of the Income Tax Act 1967 (Approval Ref: " + LHDN_TAX_DEDUCTIBLE_REF + "). All monetary donations are eligible for official tax deductions on your individual or corporate tax return.",
    },
    {
      q: isMs ? "Bagaimanakah saya menerima resit rasmi potongan cukai?" : "How do I receive my official tax receipt?",
      a: isMs
        ? "Selepas anda menghantar borang, kami memberikan nombor rujukan ikrar untuk dicatat dalam pemindahan anda. e-Resit rasmi dengan nombor rujukan LHDN lengkap dihantar ke e-mel anda sebaik sahaja penyelaras kami memadankan pemindahan itu dengan penyata bank, biasanya dalam 2 hari bekerja."
        : "When you submit the form we give you a pledge reference to quote on your transfer. Your official e-Receipt, with full LHDN reference numbers, is emailed to you once our coordinator has matched that transfer against the shelter's bank statement, usually within 2 working days.",
    },
    {
      q: isMs ? "Bolehkah syarikat korporat menderma dan menuntut pelepasan cukai?" : "Can corporate organizations donate and claim tax relief?",
      a: isMs
        ? "Ya! Penderma korporat boleh memasukkan Nama Syarikat Rasmi dan Nombor Pendaftaran SSM dalam borang penderma untuk menjana resit pengecualian cukai korporat yang sah."
        : "Yes! Corporate donors can provide their official Company Name and SSM Registration Number in the donor form to generate a valid corporate tax-exemption receipt.",
    },
    {
      q: isMs ? "Bagaimanakah cara membuat pindahan bank terus atau imbas DuitNow QR?" : "How do I make a direct bank transfer or scan DuitNow QR?",
      a: isMs
        ? "Anda boleh mengimbas kod DuitNow QR nasional kami menggunakan sebarang aplikasi perbankan Malaysia (Maybank MAE, CIMB Clicks, Touch 'n Go eWallet, Public Bank, dll.) atau pindahan terus ke Akaun Maybank kami: 5140 1234 5678 (Pertubuhan Kebajikan Hope for Strays)."
        : "You can scan our national DuitNow QR code using any Malaysian banking app (Maybank MAE, CIMB Clicks, Touch 'n Go eWallet, Public Bank, etc.) or transfer directly to our Maybank Account: 5140 1234 5678 (Pertubuhan Kebajikan Hope for Strays).",
    },
    {
      q: isMs ? "Bolehkah saya menaja haiwan reskue yang khusus?" : "Can I sponsor a specific rescue pet?",
      a: isMs
        ? "Sudah tentu! Anda boleh memasukkan nama mana-mana haiwan reskue dalam ruangan 'Dedikasi Haiwan', atau klik 'Taja Rawatan' terus dari halaman profil haiwan tersebut."
        : "Absolutely! You can enter the name of any rescue pet in our 'Dedicate Donation' field, or click 'Sponsor Care' directly from any pet's profile page.",
    },
    {
      q: isMs ? "Bolehkah saya menghantar bekalan fizikal terus ke pusat perlindungan?" : "Can I drop off physical supplies at the shelter?",
      a: isMs
        ? "Ya! Kami mengalu-alukan penghantaran barangan keperluan ke pusat perlindungan kami di Petaling Jaya (No. 18, Jalan SS 2/72) dari Selasa hingga Ahad, 10:00 pagi – 5:00 petang (Tutup pada hari Isnin)."
        : "Yes! We welcome physical supply drop-offs at our Petaling Jaya sanctuary (No. 18, Jalan SS 2/72) from Tuesday to Sunday, 10:00 AM – 5:00 PM (Closed Mondays).",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden bg-card border-b border-border py-14 sm:py-18 lg:py-22">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-wider">
              <HeartHandshake className="size-4" />
              {isMs ? "Sumbangan Terus & Penajaan Reskue" : "Direct Rescue Giving & Sponsorship"}
            </div>

            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
              {isMs ? "Bantu Selamatkan Nyawa & Biayai Rawatan Haiwan Terbiar" : "Fuel Lifesaving Medical Care & Nutrition for Rescued Strays"}
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              {isMs
                ? "Setiap ringgit disalurkan terus bagi membiayai pembedahan kecemasan, vaksinasi lengkap, dan makanan berkhasiat di pusat perlindungan Petaling Jaya kami. Berkat keprihatinan anda, 100% haiwan reskue kami diserahkan kepada keluarga angkat secara percuma."
                : "Every ringgit directly supports emergency surgeries, core vaccinations, and wholesome meals at our Petaling Jaya sanctuary. Because of your generosity, 100% of our rescued animals are rehomed through our Free Adoption policy."}
            </p>

            {/* Official Credentials Banner */}
            <div className="pt-3 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-muted/60 border border-border rounded-lg text-foreground">
                <ShieldCheck className="size-4 text-success-accent" />
                {t("donations.rosBadge", "ROS Reg: {regNo}", { regNo: PUBLIC_ROS_REGISTRATION_NO })}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-success-surface border border-success-accent/30 rounded-lg text-success-text ">
                <Award className="size-4 text-success-accent" />
                {t("donations.lhdnBadge", "LHDN Tax Deductible: Sec 44(6) ITA 1967")}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-muted/60 border border-border rounded-lg text-foreground">
                <Heart className="size-4 text-primary" />
                {isMs ? "Jaminan Adopsi 100% Percuma" : "100% Free Adoption Guarantee"}
              </span>
            </div>

            <div className="pt-5">
              <Link
                href="/impact"
                className={buttonVariants({
                  size: "sm",
                  className: "gap-2 rounded-xl px-5 text-xs font-bold uppercase tracking-wider",
                })}
              >
                {isMs ? "Lihat Laporan Impak" : "View impact report"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Interactive Giving Engine */}
      <section className="py-12 sm:py-16 bg-muted/20">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-5xl mx-auto">
          <Suspense
          fallback={
              <div className="flex min-h-[300px] items-center justify-center p-12 text-muted-foreground border border-border bg-card rounded-2xl">
                <Loader2 className="size-6 animate-spin mr-2" />
                <span>{isMs ? "Memuatkan borang sumbangan..." : "Loading donation form..."}</span>
              </div>
            }
          >
            <DonationWidget />
          </Suspense>
        </div>
      </section>

      {/* 3. Financial Transparency & Impact Visualizer */}
      <section className="py-14 sm:py-18 border-t border-border bg-card">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-10">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-primary block mb-1">
              {isMs ? "Ketelusan Kewangan" : "Financial Accountability"}
            </span>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isMs ? "Ke Mana Sumbangan Anda Disalurkan" : "Where Your Donation Goes"}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">
              {isMs
                ? "Kami beroperasi dengan ketelusan kewangan yang teliti. Peratusan di bawah dikira secara langsung daripada lejar perbelanjaan kami yang disahkan — setiap catatan disokong invois klinik atau pembekal."
                : "We operate with strict financial transparency. The shares below are computed live from our verified expense ledger — every entry is backed by a clinic or supplier invoice you can ask to inspect."}
            </p>
          </div>

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
      </section>

      {/* 4. Physical Supplies & Drop-off Wishlist */}
      <section className="py-14 sm:py-18 border-t border-border bg-muted/20">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-10">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-primary block mb-1">
              {isMs ? "Sumbangan Barangan Keperluan" : "In-Kind Giving"}
            </span>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isMs ? "Senarai Keperluan Pusat Perlindungan" : "Shelter Supplies Wishlist"}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">
              {isMs
                ? "Ingin menyumbang barangan secara terus? Kami menerima penghantaran makanan yang belum dibuka, bekalan perubatan, dan alas tidur di pusat perlindungan Petaling Jaya kami."
                : "Prefer to donate items directly? We gladly accept physical drop-offs of unopened food, medical supplies, and shelter bedding at our Petaling Jaya sanctuary."}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {wishlistCategories.map((cat, idx) => (
              <div
                key={idx}
                className="border border-border bg-card p-6 rounded-2xl space-y-4 shadow-xs"
              >
                <div className="flex items-center gap-2.5 border-b border-border pb-3">
                  <Package className="size-5 text-primary" />
                  <h3 className="font-heading text-base font-bold text-foreground">
                    {cat.category}
                  </h3>
                </div>
                <ul className="space-y-2.5 text-xs sm:text-sm text-foreground/90">
                  {cat.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-success-accent shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Sanctuary Drop-off Address Card */}
          <div className="border border-border bg-background p-6 sm:p-8 rounded-2xl shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <MapPin className="size-4" /> {isMs ? "Lokasi Penghantaran" : "Drop-off Location"}
                </div>
                <div className="font-bold text-foreground text-sm sm:text-base">
                  Hope for Strays Sanctuary
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t("footer.address", "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia")}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <Clock className="size-4" /> {isMs ? "Waktu Lawatan & Penghantaran" : "Visiting & Drop-off Hours"}
                </div>
                <div className="font-bold text-foreground text-sm">
                  {isMs ? "Selasa – Ahad: 10:00 Pagi – 5:00 Petang" : "Tuesday – Sunday: 10:00 AM – 5:00 PM"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("footer.closedMondays", "Closed on Mondays for deep sanitisation")}
                </p>
              </div>

              <div className="space-y-3 md:text-right">
                <div className="flex items-center md:justify-end gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <Phone className="size-4" /> {isMs ? "Hubungi Terus" : "Direct Contact"}
                </div>
                <div>
                  <a
                    href={`tel:${SHELTER_PHONE_TEL}`}
                    className="font-mono font-bold text-foreground text-base hover:underline"
                  >
                    {SHELTER_PHONE_DISPLAY}
                  </a>
                  <p className="text-xs text-muted-foreground">info@hopeforstrays.org</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Frequently Asked Questions */}
      <section className="py-14 sm:py-18 border-t border-border bg-card">
        <div className="w-full px-6 sm:px-8 lg:px-12 max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-primary block">
              {isMs ? "Soalan Lazim" : "Clear Answers"}
            </span>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isMs ? "Soalan Lazim Mengenai Sumbangan & Pelepasan Cukai" : "Frequently Asked Questions About Donations"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isMs ? "Ada soalan mengenai sumbangan anda, potongan cukai, atau kaedah pembayaran?" : "Have questions about your contribution, tax deductions, or payment methods?"}
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-border bg-background p-5 sm:p-6 rounded-2xl space-y-2 shadow-xs"
              >
                <div className="flex items-start gap-2.5">
                  <HelpCircle className="size-4.5 text-primary shrink-0 mt-0.5" />
                  <h3 className="font-heading text-base font-bold text-foreground">
                    {faq.q}
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-7">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom CTA to browse pets */}
          <div className="text-center pt-8 border-t border-border space-y-3">
            <p className="text-sm text-muted-foreground">
              {isMs ? "Ingin melihat haiwan-haiwan yang sedang anda bantu hari ini?" : "Want to see the animals whose lives you are changing today?"}
            </p>
            <Link
              href="/pets"
              className={buttonVariants({
                size: "lg",
                className: "gap-2 px-8 font-bold text-sm uppercase tracking-wider shadow-xs rounded-xl",
              })}
            >
              <Heart className="size-4.5 fill-current" />
              {isMs ? "Lihat Haiwan Sedia Diadopsi" : "Meet Our Adoptable Animals"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
