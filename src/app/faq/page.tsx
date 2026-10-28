import { Metadata } from "next";

import { FaqBrowser } from "@/components/features/faq/FaqBrowser";
import { Section } from "@/components/layout/Section";
import {
  getServerFaqCategoriesAsync,
  getServerFaqsAsync,
} from "@/lib/server/faqRepository";

export const metadata: Metadata = {
  title: "Frequently Asked Questions | Hope for Strays (Petaling Jaya)",
  description:
    "Answers on TNRM and community animals, adoption fees and home visits, sponsorship, volunteering, and visiting our Petaling Jaya sanctuary.",
};

/**
 * FAQ content is edited by staff at /admin/faqs, so this page must always
 * reflect the database rather than a value captured at build time.
 */
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  // Independent reads of the same source, so they run together.
  const [faqs, categories] = await Promise.all([
    getServerFaqsAsync(),
    getServerFaqCategoriesAsync(),
  ]);

  return (
    <Section id="faq">
      <div className="space-y-12">
        {/* Header: left-aligned, page-title scale (docs/page-style-guide.md §3). */}
        <div className="space-y-6">
          <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Frequently Asked Questions
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Everything adopters, volunteers, sponsors and neighbours ask us most —
            TNRM and community animals, adoption and fostering, donations and
            sponsorship, and how to find us in Petaling Jaya.
          </p>
        </div>

        <FaqBrowser faqs={faqs} categories={categories} />
      </div>
    </Section>
  );
}
