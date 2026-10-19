import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getSponsorCertificate,
  getCurrentSupporterTier,
  sponsorSessionNamesASponsor,
} from "@/lib/domain/sponsorAccess";
import { buttonVariants } from "@/components/ui/button";
import { SponsorCertificate, UpgradeNudge } from "@/components/features/sponsors";

export const metadata: Metadata = {
  title: "Sponsorship e-Certificate | Hope for Strays",
  description: "Your annual Hope for Strays sponsorship certificate.",
  robots: { index: false, follow: false },
};

/**
 * The annual sponsorship e-Certificate.
 *
 * `getSponsorCertificate` returns `null` below Silver, so an under-tier sponsor's request
 * never produces a certificate to render — the gate is the absence of the artefact, not a
 * hidden element.
 */
export default async function SponsorCertificatePage() {
  // The same test as the dashboard and the sign-in page. On the cookie alone, a sponsor
  // whose record is gone was shown this page, empty, while the other two sent them to
  // sign in.
  if (!(await sponsorSessionNamesASponsor())) {
    redirect("/sponsor/login");
  }

  const [certificate, currentTier] = await Promise.all([
    getSponsorCertificate(),
    getCurrentSupporterTier(),
  ]);

  return (
    <section className="w-full px-6 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link
          href="/sponsor/dashboard"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "gap-2 print:hidden",
          })}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>

        {certificate ? (
          <SponsorCertificate data={certificate} />
        ) : (
          <UpgradeNudge
            requiredTier="SILVER"
            currentTier={currentTier}
            perkDescription="annual downloadable e-Certificate"
            perkDescriptionMs="e-Sijil tahunan yang boleh dimuat turun"
          />
        )}
      </div>
    </section>
  );
}
