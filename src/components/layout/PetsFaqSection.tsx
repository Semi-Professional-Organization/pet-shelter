"use client";

import { SHELTER_WHATSAPP_URL, SHELTER_PHONE_TEL, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import React, { useState, useEffect, useTransition, useRef } from "react";
import { PhoneCall, HelpCircle, ChevronDown, MessageCircle } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FaqItem } from "@/types/faq";
import { getFaqsAction } from "@/actions/faqs";
import {
  ALL_CATEGORY_VALUE,
  CategoryTab,
  DerivedCategory,
  withAllTab,
  getFaqCategoryLabel,
} from "@/lib/presentation/categoryTabs";

/**
 * The one tab that is not derived from the fixture. Its wording is carried
 * over verbatim from the hardcoded list this component used to own: the
 * bilingual category labels come from the fixture rows, and "all" has no row
 * to come from.
 */
const ALL_FAQ_TAB: CategoryTab = {
  value: ALL_CATEGORY_VALUE,
  labelEn: "All Topics",
  labelMs: "Semua Topik",
};

export function PetsFaqSection({
  initialFaqs,
  initialCategories,
}: { initialFaqs?: FaqItem[]; initialCategories?: DerivedCategory[] } = {}) {
  const { isMs } = useLanguage();
  const [faqs, setFaqs] = useState<FaqItem[]>(initialFaqs || []);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY_VALUE);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(["faq-001", "faq-004", "faq-006"]));
  const [isPending, startTransition] = useTransition();
  const isInitialMount = useRef(true);

  const categoryTabs = withAllTab(ALL_FAQ_TAB, initialCategories);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (initialFaqs && initialFaqs.length > 0 && selectedCategory === ALL_CATEGORY_VALUE) {
        return;
      }
    }

    startTransition(async () => {
      const res = await getFaqsAction(
        selectedCategory === ALL_CATEGORY_VALUE ? undefined : selectedCategory
      );
      if (res.success && res.data) {
        setFaqs(res.data);
      }
    });
  }, [selectedCategory, initialFaqs]);

  const toggleAccordion = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section className="w-full px-6 sm:px-8 lg:px-12 pt-14 border-t border-border mt-12" id="faq">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            <HelpCircle className="size-3.5" />
            {isMs ? "Soalan Lazim Komuniti" : "Community & Operations FAQ"}
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
            {isMs ? "Soalan Lazim Mengenai TNRM & Perlindungan" : "Frequently Asked Questions"}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
            {isMs
              ? "Ketahui lebih lanjut mengenai program TNRM kampus UM, penajaan peribadi haiwan reskue, pelepasan cukai LHDN Seksyen 44(6), dan garis panduan lawatan santuari."
              : "Learn about UM campus stray management, ear-notching science, personalized animal sponsorships, LHDN Sec 44(6) tax deductions, and shelter visiting hours."}
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2 pt-2">
          {categoryTabs.map((tab) => {
            const isActive = selectedCategory === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setSelectedCategory(tab.value)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? "bg-foreground text-background shadow-xs"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {isMs ? tab.labelMs : tab.labelEn}
              </button>
            );
          })}
        </div>

        {/* Accordion FAQ List */}
        <div className="space-y-4 pt-2">
          {isPending && faqs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {isMs ? "Memuatkan soalan lazim..." : "Loading FAQs..."}
            </div>
          ) : (
            faqs.map((faq) => {
              const isOpen = openIds.has(faq.id);
              return (
                <div
                  key={faq.id}
                  className="border border-border bg-card rounded-2xl overflow-hidden transition-all shadow-xs"
                >
                  <button
                    onClick={() => toggleAccordion(faq.id)}
                    className="w-full p-5 sm:p-6 text-left flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <span className="text-3xs font-bold uppercase tracking-wider text-primary block">
                        {getFaqCategoryLabel(faq.category, isMs)}
                      </span>
                      <h3 className="font-heading text-base sm:text-lg font-bold text-foreground leading-snug">
                        {isMs ? faq.questionMs : faq.question}
                      </h3>
                    </div>
                    <ChevronDown
                      className={`size-5 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-foreground" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-0 border-t border-border/40 text-sm sm:text-base leading-relaxed text-muted-foreground">
                      <p className="mt-3.5 whitespace-pre-line">{isMs ? faq.answerMs : faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Contact Banner */}
        <div className="mt-12 bg-muted/40 border border-border p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="text-base sm:text-lg font-bold text-foreground">
              {isMs
                ? "Ada soalan mengenai haiwan reskue atau program TNRM kami?"
                : "Have questions about an animal or reporting a stray?"}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isMs
                ? "Hubungi meja santuari Petaling Jaya kami Selasa hingga Ahad, 10:00 pagi – 5:00 petang."
                : "Call our shelter desk in Petaling Jaya Tuesday through Sunday, 10:00 AM – 5:00 PM."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={`tel:${SHELTER_PHONE_TEL}`}
              className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-foreground/85 transition-colors rounded-xl"
            >
              <PhoneCall className="size-3.5" />
              {SHELTER_PHONE_DISPLAY}
            </a>
            <a
              href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20I%20have%20a%20question%20regarding%20the%20shelter.`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-brand-whatsapp text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-brand-whatsapp-hover transition-colors rounded-xl"
            >
              <MessageCircle className="size-3.5" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
