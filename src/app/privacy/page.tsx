import { PUBLIC_ROS_REGISTRATION_NO } from "@/lib/domain/shelterIdentity";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Notice (PDPA) | Hope for Strays",
  description:
    "Personal Data Protection Act 2010 (PDPA) Notice and data privacy policy of Hope for Strays animal rescue organisation in Petaling Jaya, Selangor.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-card py-12 sm:py-16">
      <div className="mx-auto max-w-4xl px-6 sm:px-8 lg:px-12 space-y-10">
        {/* Header */}
        <div className="space-y-4 border-b border-border pb-8">
          <Link
            href="/"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "gap-1.5 text-xs text-muted-foreground hover:text-foreground -ml-2 mb-2",
            })}
          >
            <ArrowLeft className="size-3.5" />
            Back to Home
          </Link>

          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Personal Data Protection & Privacy Notice
          </h1>
          <p className="text-sm text-muted-foreground">
            Last Updated: August 2026 • Persatuan Harapan Haiwan Terbiar Selangor (ROS Reg: {PUBLIC_ROS_REGISTRATION_NO})
          </p>
        </div>

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none text-sm text-foreground/90 space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">1. Introduction & Statutory Scope</h2>
            <p>
              Hope for Strays (&ldquo;the Society&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is committed to safeguarding personal data in accordance with the Malaysian Personal Data Protection Act 2010 (&ldquo;PDPA&rdquo;). This Privacy Notice explains how we collect, process, manage, and protect the personal data of adopters, donors, volunteers, foster carers, and website visitors.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">2. Personal Data We Collect</h2>
            <p>We may collect and process personal data that you provide directly, including:</p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground pl-2">
              <li><strong>Adoption & Foster Applicants:</strong> Full name, Malaysian NRIC / Passport number, residential address, telephone number, email, housing type, landlord consent records, and household pet history.</li>
              <li><strong>Donors & Sponsors:</strong> Donor name, email address, contact number, payment transaction references, and Tax Identification Number / NRIC for official LHDN Section 44(6) tax exemption receipts.</li>
              <li><strong>Volunteers & Visitors:</strong> Name, contact information, emergency contacts, availability schedules, and sanctuary sign-in logs.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">3. Purpose of Processing Personal Data</h2>
            <p>Your personal data is processed strictly for legitimate non-profit shelter operations, including:</p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground pl-2">
              <li>Assessing adoption and temporary foster care applications for animal welfare and premises safety.</li>
              <li>Issuing official tax-deductible e-Receipts in compliance with Inland Revenue Board of Malaysia (LHDN) regulations.</li>
              <li>Scheduling adoption meet-and-greets, home checks, and veterinary follow-up consultations.</li>
              <li>Complying with statutory reporting requirements set by the Registrar of Societies (ROS) Malaysia.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">4. Disclosure & Data Protection</h2>
            <p>
              We maintain strict confidentiality. We do not sell, rent, or lease personal information to third-party commercial entities. Personal data is disclosed only to authorized shelter coordinators, appointed veterinary surgeons for microchip registration, or regulatory authorities (LHDN / ROS) where legally required.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">5. Data Retention & Access Rights</h2>
            <p>
              Under the PDPA 2010, you have the right to request access to, correct, or limit the processing of your personal data. Data access enquiries can be directed in writing to our Data Protection Officer at <a href="mailto:privacy@hopeforstrays.org" className="text-foreground underline font-semibold">privacy@hopeforstrays.org</a> or via post to No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
