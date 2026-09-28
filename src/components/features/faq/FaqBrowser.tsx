"use client";

import React, { useMemo, useState } from "react";
import { Search, X, HelpCircle } from "lucide-react";

import { useLanguage } from "@/components/providers/LanguageProvider";
import { FaqContactBanner } from "@/components/features/faq/FaqContactBanner";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import {
  ALL_CATEGORY_VALUE,
  CategoryTab,
  DerivedCategory,
  getFaqCategoryLabel,
  withAllTab,
} from "@/lib/presentation/categoryTabs";
// Entries arrive already ordered by `displayOrder` from the repository;
// filtering and grouping below preserve that order.
import { countFaqsByCategory, filterFaqItems } from "@/lib/domain/faq";
import { FaqItem } from "@/types/faq";
import { cn } from "@/lib/utils";

/**
 * The "all" tab has no data row to come from, so this strip supplies its own,
 * worded for a page that is only about FAQs.
 */
const ALL_FAQ_TAB: CategoryTab = {
  value: ALL_CATEGORY_VALUE,
  labelEn: "All Topics",
  labelMs: "Semua Topik",
};

/** Wraps each occurrence of the search terms in <mark>. */
function highlight(text: string, query: string): React.ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Escape regex metacharacters so a query like "RM5 (free)" cannot throw.
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (terms.length === 0) return text;

  // Splitting on a capturing group puts the matched text at every odd index, so
  // position identifies a match without re-testing a stateful /g/ regex.
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5 py-px">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

/** Renders answer copy as paragraphs, splitting on blank lines. */
function AnswerBody({ answer, query }: { answer: string; query: string }) {
  const paragraphs = answer.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, i) => (
        <p key={i}>{query ? highlight(paragraph, query) : paragraph}</p>
      ))}
    </div>
  );
}

export function FaqBrowser({
  faqs,
  categories,
}: {
  faqs: FaqItem[];
  /** Only the categories the published data populates, derived server-side. */
  categories?: DerivedCategory[];
}) {
  const { isMs } = useLanguage();
  const [category, setCategory] = useState<string>(ALL_CATEGORY_VALUE);
  const [search, setSearch] = useState("");

  const counts = useMemo(() => countFaqsByCategory(faqs), [faqs]);
  const tabs = useMemo(() => withAllTab(ALL_FAQ_TAB, categories), [categories]);

  const visible = useMemo(
    () => filterFaqItems(faqs, { category, search }),
    [faqs, category, search]
  );

  const isSearching = search.trim().length > 0;

  // While searching, every match is expanded so answers are readable without a
  // second click; browsing without a query starts fully collapsed.
  const openValues = useMemo(
    () => (isSearching ? visible.map((f) => f.id) : []),
    [isSearching, visible]
  );

  /** Grouped under category headings, in the vocabulary's own order. */
  const groups = useMemo(() => {
    const present = tabs.filter((t) => t.value !== ALL_CATEGORY_VALUE);
    return present
      .map((tab) => ({
        tab,
        items: visible.filter((f) => f.category === tab.value),
      }))
      .filter((g) => g.items.length > 0);
  }, [tabs, visible]);

  function renderEntry(entry: FaqItem) {
    const question = isMs ? entry.questionMs : entry.question;
    const answer = isMs ? entry.answerMs : entry.answer;
    return (
      <AccordionItem key={entry.id} value={entry.id}>
        <AccordionTrigger>
          <span>{isSearching ? highlight(question, search) : question}</span>
        </AccordionTrigger>
        <AccordionPanel>
          <AnswerBody answer={answer} query={isSearching ? search : ""} />
        </AccordionPanel>
      </AccordionItem>
    );
  }

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="max-w-2xl">
        <label htmlFor="faq-search" className="sr-only">
          {isMs ? "Cari soalan lazim" : "Search frequently asked questions"}
        </label>
        <div className="relative flex items-center border-b border-input focus-within:border-b-ring transition-colors">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <Input
            id="faq-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isMs
                ? "Cari: yuran adopsi, TNRM, waktu lawatan…"
                : "Search: adoption fees, TNRM, visiting hours…"
            }
            className="border-b-transparent pl-3 focus-visible:border-b-transparent [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 rounded-md"
              aria-label={isMs ? "Kosongkan carian" : "Clear search"}
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          {isSearching
            ? isMs
              ? `${visible.length} daripada ${faqs.length} soalan sepadan`
              : `${visible.length} of ${faqs.length} questions match`
            : isMs
              ? `${faqs.length} soalan lazim`
              : `${faqs.length} questions answered`}
        </p>
      </div>

      {/* Category filter pills */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={isMs ? "Tapis mengikut kategori" : "Filter by category"}
      >
        {tabs.map((tab) => {
          const isActive = category === tab.value;
          const count = counts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setCategory(tab.value)}
              aria-pressed={isActive}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40"
              )}
            >
              {isMs ? tab.labelMs : tab.labelEn}
              <span
                className={cn(
                  "text-2xs font-bold tabular-nums",
                  isActive ? "text-background/70" : "text-muted-foreground/70"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {visible.length === 0 ? (
        <div className="border border-border rounded-2xl bg-muted/30 px-6 py-12 text-center max-w-2xl">
          <HelpCircle aria-hidden className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-heading text-lg font-bold text-foreground">
            {isMs ? "Tiada jawapan yang sepadan" : "No answers matched"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMs
              ? "Cuba kata kunci lain, atau hubungi meja santuari kami dan kami akan menjawabnya secara peribadi."
              : "Try a different keyword, or call our shelter desk and we will answer it personally."}
          </p>
        </div>
      ) : category === ALL_CATEGORY_VALUE && !isSearching ? (
        // Browsing everything: group under category headings for scannability.
        <div className="space-y-10 max-w-3xl">
          {groups.map((group) => (
            <section key={group.tab.value}>
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">
                {getFaqCategoryLabel(group.tab.value, isMs)}
              </h2>
              <Accordion multiple hiddenUntilFound className="border-t border-border">
                {group.items.map(renderEntry)}
              </Accordion>
            </section>
          ))}
        </div>
      ) : (
        <div className="max-w-3xl">
          <Accordion
            multiple
            hiddenUntilFound
            // Re-mounting on the query resets the uncontrolled open state so
            // freshly matched entries appear already expanded.
            key={`${category}:${search}`}
            defaultValue={openValues}
            className="border-t border-border"
          >
            {visible.map(renderEntry)}
          </Accordion>
        </div>
      )}

      <div className="mt-4">
        <FaqContactBanner />
      </div>
    </div>
  );
}
