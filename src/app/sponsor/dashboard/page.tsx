import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileBadge, Ticket } from "lucide-react";
import { getSponsorDashboard } from "@/lib/domain/sponsorAccess";
import { buttonVariants } from "@/components/ui/button";
import { TierGate } from "@/components/features/sponsors/TierGate";
import {
  SponsorDashboardView,
  CaretakerQaBox,
} from "@/components/features/sponsors";

export const metadata: Metadata = {
  title: "Sponsor Dashboard | Hope for Strays",
  description: "Your sponsored rescues, sponsorship tier and unlocked privileges.",
  robots: { index: false, follow: false },
};

/**
 * The sponsor portal.
 *
 * A Server Component, and dynamic by consequence: `getSponsorDashboard` reads the sponsor
 * session cookie. Authorization happens here, before any data is fetched — an unsigned-in
 * visitor is redirected rather than served an empty shell to hydrate.
 */
export default async function SponsorDashboardPage() {
  const dashboard = await getSponsorDashboard();

  if (!dashboard) {
    redirect("/sponsor/login");
  }

  return (
    <section className="w-full px-6 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-12">
        <SponsorDashboardView dashboard={dashboard} />

        {/* Silver privilege: the annual e-Certificate. */}
        <section aria-labelledby="certificate-heading" className="space-y-4">
          <h2
            id="certificate-heading"
            className="font-heading text-2xl font-bold text-foreground"
          >
            Annual e-Certificate
          </h2>
          <TierGate
            requiredTier="SILVER"
            perkDescription="annual downloadable e-Certificate"
            perkDescriptionMs="e-Sijil tahunan yang boleh dimuat turun"
          >
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileBadge className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden />
                <div className="space-y-1">
                  <p className="font-heading text-lg font-bold text-foreground">
                    Your {dashboard.tier === "GOLD" ? "Gold" : "Silver"} sponsorship
                    certificate is ready
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Issued against your recognised contribution and the rescues you
                    support. Print it, or save it as a PDF.
                  </p>
                </div>
              </div>
              <Link
                href="/sponsor/certificate"
                className={buttonVariants({ className: "shrink-0 font-bold" })}
              >
                Download e-Certificate
              </Link>
            </div>
          </TierGate>
        </section>

        {/* Gold privileges: open days and direct caretaker Q&A. */}
        <section aria-labelledby="gold-heading" className="space-y-4">
          <h2 id="gold-heading" className="font-heading text-2xl font-bold text-foreground">
            Gold privileges
          </h2>
          <TierGate
            requiredTier="GOLD"
            perkDescription="open day invitations and caretaker Q&A"
            perkDescriptionMs="jemputan hari terbuka dan soal jawab penjaga"
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-6">
                <Ticket className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden />
                <div className="space-y-1">
                  <p className="font-heading text-lg font-bold text-foreground">
                    Sanctuary open day — 18 October 2026
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your invitation covers two guests. Doors open 10:00 AM at Jalan SS
                    2/72, Petaling Jaya. Confirmation details follow by email two weeks
                    beforehand.
                  </p>
                </div>
              </div>

              <CaretakerQaBox />
            </div>
          </TierGate>
        </section>
      </div>
    </section>
  );
}
