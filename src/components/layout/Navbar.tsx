"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Heart,
  Menu,
  HeartHandshake,
  Compass,
  ChevronDown,
  FileSearch,
  Users,
  Building2,
  HandHeart,
  Stethoscope,
  Sparkles,
  Award,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { LanguageToggle } from "@/components/providers/LanguageToggle";
import { PetMatchQuiz } from "@/components/features/pets/PetMatchQuiz";
import { SponsorshipModal } from "@/components/features/pets/SponsorshipModal";
import { useLanguage, useTypedTranslation } from "@/components/providers/LanguageProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navbar() {
  const pathname = usePathname();
  const { isMs } = useLanguage();
  const t = useTypedTranslation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isSponsorshipOpen, setIsSponsorshipOpen] = useState(false);

  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const adoptionLinks = [
    {
      href: "/pets",
      label: isMs ? "Lihat Haiwan Reskue" : "Meet Our Animals",
      desc: isMs ? "Haiwan sedia diadopsi & dalam pemulihan" : "Adoptable & recovering rescue animals",
      icon: Heart,
    },
    {
      href: "/#how-it-works",
      label: isMs ? "Proses & Syarat Adopsi" : "Adoption Process & Criteria",
      // "3-langkah", not "4-langkah": `HomeProcessSection` renders steps 01-03.
      // The link pointed at an unrendered anchor until 2026-09-22, so the
      // mismatch was invisible — restoring the destination is what exposed it.
      desc: isMs ? "Panduan 3-langkah adopsi percuma 100%" : "Step-by-step 100% free adoption guide",
      icon: Sparkles,
    },
    {
      href: "/applications/track",
      label: isMs ? "Semak Status Permohonan" : "Track Application Status",
      desc: isMs ? "Semak status permohonan dengan ID rujukan" : "Check review progress via reference ID",
      icon: FileSearch,
    },
  ];

  const getInvolvedLinks = [
    {
      href: "/sponsors",
      label: isMs ? "Dinding Penaja Awam" : "Public Sponsor Wall",
      desc: isMs
        ? "Penyokong Gangsa, Perak & Emas kami"
        : "Our Bronze, Silver & Gold supporters",
      icon: Award,
    },
    {
      href: "/get-involved#volunteer",
      label: isMs ? "Sukarelawan Santuari & TNRM" : "Volunteer & Field Shifts",
      desc: isMs ? "Tugas berjalan, sanitasi sangkar & operasi lapangan" : "Dog walking, shelter care & field trapping",
      icon: Users,
    },
    {
      href: "/get-involved#foster",
      label: isMs ? "Program Keluarga Asuh (Foster)" : "Foster-to-Adopt & Neonatal Care",
      desc: isMs ? "Asuhan sementara pasca-pembedahan" : "Temporary care for recovering strays",
      icon: HandHeart,
    },
    {
      href: "/get-involved#corporate",
      label: isMs ? "CSR Korporat & Universiti" : "Corporate CSR & Group Days",
      desc: isMs ? "Hari khidmat masyarakat & padanan sumbangan" : "Workdays, education booths & matching drives",
      icon: Building2,
    },
    {
      href: "/get-involved#partnerships",
      label: isMs ? "Rakan Kongsi & Klinik Veterinar" : "Clinical & Community Partners",
      desc: isMs ? "Kerjasama veterinar & kelab pelajar UM" : "Vet clinic networks & student societies",
      icon: Stethoscope,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur-md">
        <div className="flex h-16 w-full items-center justify-between px-6 sm:px-8 lg:px-10">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 focus-visible:ring-2">
            <div className="flex size-9 items-center justify-center overflow-hidden rounded-mark bg-brand-mark text-primary-foreground shadow-brand-sm ring-1 ring-brand-mark-ring">
              <Image src="/android-icon-192x192.png" alt="Hope for Strays" width={36} height={36} className="h-full w-full object-cover" style={{ width: "auto", height: "auto" }} priority />
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-base sm:text-lg font-bold tracking-tight text-foreground leading-tight">
                Hope for Strays <span className="text-primary text-xs font-bold uppercase tracking-wider">UM</span>
              </span>
              {/*
                The English here is verbatim the hero's `<h1>`, while the Malay
                is a shortened form — one string in two places, translated
                twice, differently. Shortening the English to match was tried
                and reverted: it dropped "& Education", one of the three
                pillars this org names in `HomeOurWorkSection`, which is a
                content decision rather than a deduplication. Tracked in
                `tasks/open/home-page-copy-is-duplicated-outside-the-dictionary.md`.
              */}
              <span className="text-3xs text-muted-foreground font-medium uppercase tracking-wider hidden sm:block">
                {isMs ? "Kewujudan Bersama melalui TNRM" : "Coexistence through TNRM & Education"}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-5 xl:gap-6 lg:flex" aria-label="Main Navigation">
            {/* Top Level: Meet Our Animals */}
            <Link
              href="/pets"
              className={`text-sm font-semibold transition-colors hover:text-foreground focus-visible:ring-2 ${
                pathname === "/pets"
                  ? "text-foreground border-b-2 border-foreground pb-0.5"
                  : "text-muted-foreground"
              }`}
            >
              {isMs ? "Haiwan Kami" : "Meet Our Animals"}
            </Link>

            {/* Dropdown: Adoption */}
            <div
              className="relative"
              onMouseEnter={() => setOpenDropdown("adoption")}
              onMouseLeave={() => setOpenDropdown(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpenDropdown(null);
              }}
            >
              <button
                aria-haspopup="true"
                aria-expanded={openDropdown === "adoption"}
                onClick={() => setOpenDropdown((prev) => (prev === "adoption" ? null : "adoption"))}
                className={`inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:text-foreground cursor-pointer ${
                  pathname.startsWith("/applications")
                    ? "text-foreground font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {isMs ? "Adopsi" : "Adoption"}
                <ChevronDown className="size-3.5 opacity-60" />
              </button>

              {openDropdown === "adoption" && (
                <div className="absolute top-full left-0 w-72 pt-2 z-50">
                  <div className="border border-border bg-card shadow-lg p-2 rounded-2xl space-y-1">
                    {adoptionLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpenDropdown(null)}
                        className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/70 transition-colors"
                      >
                        <item.icon className="size-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-foreground">{item.label}</p>
                          <p className="text-2xs text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown: Get Involved */}
            <div
              className="relative"
              onMouseEnter={() => setOpenDropdown("get-involved")}
              onMouseLeave={() => setOpenDropdown(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpenDropdown(null);
              }}
            >
              <button
                aria-haspopup="true"
                aria-expanded={openDropdown === "get-involved"}
                onClick={() => setOpenDropdown((prev) => (prev === "get-involved" ? null : "get-involved"))}
                className={`inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:text-foreground cursor-pointer ${
                  pathname === "/get-involved"
                    ? "text-foreground font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {isMs ? "Sertai Kami" : "Get Involved"}
                <ChevronDown className="size-3.5 opacity-60" />
              </button>

              {openDropdown === "get-involved" && (
                <div className="absolute top-full left-0 w-80 pt-2 z-50">
                  <div className="border border-border bg-card shadow-lg p-2 rounded-2xl space-y-1">
                    {getInvolvedLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpenDropdown(null)}
                        className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/70 transition-colors"
                      >
                        <item.icon className="size-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-foreground">{item.label}</p>
                          <p className="text-2xs text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Top Level: Donate & Sponsor */}
            <Link
              href="/donate"
              className={`text-sm font-semibold transition-colors hover:text-foreground focus-visible:ring-2 ${
                pathname === "/donate"
                  ? "text-foreground border-b-2 border-foreground pb-0.5"
                  : "text-muted-foreground"
              }`}
            >
              {isMs ? "Taja & Sumbang" : "Donate & Sponsor"}
            </Link>

            {/* Top Level: FAQ */}
            <Link
              href="/faq"
              className={`text-sm font-semibold transition-colors hover:text-foreground focus-visible:ring-2 ${
                pathname === "/faq"
                  ? "text-foreground border-b-2 border-foreground pb-0.5"
                  : "text-muted-foreground"
              }`}
            >
              {isMs ? "Soalan Lazim" : "FAQ"}
            </Link>
          </nav>

          {/* Desktop Right Actions */}
          <div className="hidden items-center gap-2.5 lg:flex">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsQuizOpen(true)}
              className="text-xs font-semibold gap-1.5 h-8 px-2.5 rounded-xl cursor-pointer"
            >
              <Compass className="size-3.5" />
              {isMs ? "Kuiz Keserasian" : "Match Quiz"}
            </Button>

            {/* <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSponsorshipOpen(true)}
              className="text-xs font-semibold gap-1.5 h-8 px-2.5 rounded-xl cursor-pointer"
            >
              <HeartHandshake className="size-3.5" />
              {isMs ? "Taja Haiwan" : "Sponsor Care"}
            </Button> */}

            <LanguageToggle />
            <ThemeToggle />

            <Link
              href="/pets"
              className={buttonVariants({
                size: "sm",
                className: "text-xs font-bold uppercase tracking-wider gap-1.5 h-8 px-3.5 rounded-xl focus-visible:ring-2",
              })}
            >
              <Heart className="size-3.5 fill-current" />
              {isMs ? "Adopsi" : "Adopt"}
            </Link>
          </div>

          {/* Mobile Menu Trigger & Controls */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <LanguageToggle showIcon={false} />
            <ThemeToggle />
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger
                className="inline-flex size-9 items-center justify-center text-foreground hover:bg-muted focus-visible:ring-2 rounded-xl"
                aria-label="Open Navigation Menu"
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] bg-card overflow-y-auto">
                <SheetHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex size-7 items-center justify-center overflow-hidden rounded-md bg-primary/10 ring-1 ring-border">
                      <Image src="/android-icon-192x192.png" alt="Hope for Strays" width={28} height={28} className="h-full w-full object-cover" style={{ width: "auto", height: "auto" }} />
                    </div>
                    <SheetTitle className="font-heading text-base font-bold">Hope for Strays UM</SheetTitle>
                  </div>
                </SheetHeader>
                <div className="flex flex-col gap-3 px-6 py-4">
                  {/* Quick Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsMobileOpen(false);
                        setIsQuizOpen(true);
                      }}
                      className="w-full text-xs font-bold gap-1 rounded-xl cursor-pointer"
                    >
                      <Compass className="size-3" />
                      {isMs ? "Kuiz" : "Quiz"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsMobileOpen(false);
                        setIsSponsorshipOpen(true);
                      }}
                      className="w-full text-xs font-bold gap-1 rounded-xl cursor-pointer"
                    >
                      <HeartHandshake className="size-3" />
                      {isMs ? "Taja" : "Sponsor"}
                    </Button>
                  </div>

                  {/* Primary Navigation Links */}
                  <div className="space-y-1 border-t border-border pt-3">
                    <Link
                      href="/pets"
                      onClick={() => setIsMobileOpen(false)}
                      className="block text-sm font-bold py-2 hover:text-primary transition-colors"
                    >
                      🐾 {isMs ? "Haiwan Reskue Kami" : "Meet Our Animals"}
                    </Link>

                    <Link
                      href="/donate"
                      onClick={() => setIsMobileOpen(false)}
                      className="block text-sm font-bold py-2 hover:text-primary transition-colors"
                    >
                      💖 {isMs ? "Taja & Sumbang (LHDN)" : "Donate & Sponsor (LHDN)"}
                    </Link>

                    <Link
                      href="/get-involved"
                      onClick={() => setIsMobileOpen(false)}
                      className="block text-sm font-bold py-2 hover:text-primary transition-colors"
                    >
                      👥 {isMs ? "Sertai Kami (Sukarelawan/CSR)" : "Get Involved & CSR"}
                    </Link>

                    <Link
                      href="/faq"
                      onClick={() => setIsMobileOpen(false)}
                      className="block text-sm font-bold py-2 hover:text-primary transition-colors"
                    >
                      ❓ {isMs ? "Soalan Lazim" : "FAQ"}
                    </Link>

                    <Link
                      href="/applications/track"
                      onClick={() => setIsMobileOpen(false)}
                      className="block text-sm font-bold py-2 hover:text-primary transition-colors border-t border-border/40 pt-3 mt-3"
                    >
                      🔍 {isMs ? "Semak Status Permohonan" : "Track Application"}
                    </Link>

                    <Link
                      href="/bulletins"
                      onClick={() => setIsMobileOpen(false)}
                      className="block text-sm font-bold py-2 hover:text-primary transition-colors"
                    >
                      📰 {t("nav.bulletins")}
                    </Link>
                  </div>

                  {/* Shelter Info */}
                  <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2 text-xs text-muted-foreground">
                    <p className="font-bold text-foreground">{isMs ? "Santuari Petaling Jaya:" : "PJ Sanctuary Desk:"}</p>
                    <p>03-7876 5432 • Tue–Sun: 10AM–5PM</p>
                    <Link
                      href="/pets"
                      onClick={() => setIsMobileOpen(false)}
                      className={buttonVariants({
                        className: "w-full mt-2 justify-center text-xs font-bold uppercase tracking-wider rounded-xl",
                      })}
                    >
                      {isMs ? "Semua Haiwan" : "Browse All Animals"}
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Global Modals from Navbar */}
      <PetMatchQuiz
        open={isQuizOpen}
        onOpenChange={setIsQuizOpen}
      />

      <SponsorshipModal
        open={isSponsorshipOpen}
        onOpenChange={setIsSponsorshipOpen}
      />
    </>
  );
}
