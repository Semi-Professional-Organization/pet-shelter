import { FaqDataTable } from "@/components/admin/FaqDataTable";
import { requireAdminSection } from "@/lib/security/adminSectionGate";
import { listFaqRecords } from "@/lib/server/faqRepository";

export const dynamic = "force-dynamic";

/**
 * FAQ content management.
 *
 * The same capability is enforced again inside every action in `@/actions/faqs`,
 * so this check controls what is rendered rather than what is permitted.
 */
export default async function AdminFaqsPage() {
  // Verified, so a suspended editor's unexpired cookie does not render the drafts.
  await requireAdminSection("/admin/faqs");

  const faqs = await listFaqRecords();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          FAQ Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Questions and answers shown on the public{" "}
          <a href="/faq" target="_blank" className="underline hover:text-foreground">
            FAQ page
          </a>{" "}
          and in the FAQ section of the animals directory. Changes go live
          immediately — every edit is recorded in the audit log.
        </p>
      </div>

      <FaqDataTable initialFaqs={faqs} />
    </div>
  );
}
