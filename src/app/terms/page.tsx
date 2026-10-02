import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Adoption & Sanctuary Terms | Hope for Strays",
  description:
    "Adoption terms of service, foster care agreement policies, and animal welfare standards for Hope for Strays in Petaling Jaya, Selangor.",
};

export default function TermsOfServicePage() {
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
            Adoption Terms & Sanctuary Policies
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective Date: August 2026 • Hope for Strays
          </p>
        </div>

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none text-sm text-foreground/90 space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">1. Non-Commercial Welfare Commitment</h2>
            <p>
              Hope for Strays operates as a registered non-profit sanctuary under Malaysian law. We do not breed, sell, or commercially broker companion animals. Every animal in our care is rehomed on the basis of animal welfare, suitability of living premises, and lifelong household compatibility.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">2. Veterinary & Handover Standards</h2>
            <p>
              Prior to adoption finalization, all companion animals receive mandatory veterinary interventions:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground pl-2">
              <li>Core vaccination courses (6-in-1 canine core or FVRCP feline core).</li>
              <li>Spay or neuter sterilization surgery performed by a licensed Malaysian veterinary surgeon.</li>
              <li>Implantation and statutory registration of an ISO standard microchip.</li>
              <li>Internal broad-spectrum deworming and external flea/tick preventative treatment.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">3. Adopter Undertakings & Responsibilities</h2>
            <p>Upon adopting an animal from Hope for Strays, the adopter formally undertakes:</p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground pl-2">
              <li>To provide humane shelter, adequate clean water, daily quality nutrition, and routine veterinary attention.</li>
              <li>Not to keep the animal continuously tethered, caged outdoors, or exposed to extreme weather.</li>
              <li>To obtain necessary local council pet licensing (e.g. Majlis Bandaraya Petaling Jaya / MBPJ pet license) where applicable.</li>
              <li>Never to sell, abandon, or surrender the animal for commercial research or fighting purposes.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">4. Lifetime Shelter Safety Net & Return Clause</h2>
            <p>
              If at any point during the animal&apos;s lifetime the adopter is unable to continue caring for the pet due to unforeseen medical, financial, or relocation emergencies, the adopter agrees to notify Hope for Strays immediately. We guarantee unconditional sanctuary intake and rehoming assistance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">5. Donations</h2>
            <p>
              Monetary contributions and sponsorship gifts are voluntary donations.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
