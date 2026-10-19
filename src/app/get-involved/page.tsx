import { PUBLIC_ROS_REGISTRATION_NO, SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
// Read through the repository, not @/actions/settings: importing a "use server"
// export here would register it as a POST-reachable endpoint on this public route.
import { getServerSettingsAsync } from "@/lib/server/settingsRepository";
import { isUsableFormUrl } from "@/lib/volunteerFormUrl";
import { Metadata } from "next";
import {
  Users,
  HandHeart,
  Building2,
  Stethoscope,
  MessageCircle,
  Calendar,
  Truck,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Get Involved — Volunteer, Foster, CSR & Partnerships | Hope for Strays UM",
  description:
    "Join the mission to stabilize and protect community animals across UM and Petaling Jaya. Volunteer for TNRM shifts, foster recovering rescues, arrange corporate CSR days, or partner as a veterinary clinic.",
};

/**
 * Rendered per request so a volunteer form URL saved in /admin/settings is reflected
 * on the CTA immediately, without waiting for a rebuild.
 */
export const dynamic = "force-dynamic";

export default async function GetInvolvedPage() {
  const settings = await getServerSettingsAsync();
  // "" when unset, still the shipped placeholder, or not an http(s) URL. Keeping an
  // unusable value out of the render means visitors get the WhatsApp fallback rather
  // than a dead primary button, and the placeholder never reaches the RSC payload.
  const rawFormUrl = settings.volunteerFormUrl ?? "";
  const volunteerFormUrl = isUsableFormUrl(rawFormUrl) ? rawFormUrl : "";

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Hero Banner */}
      <section className="w-full border-b border-border bg-muted/20 py-16 sm:py-20 px-6 sm:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider">
            <Users className="size-4" />
            Community & Campus Action
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
            Get Involved with Hope for Strays UM
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed">
            Humane stray population control and animal welfare succeed through community hands. Whether you have 2 hours on a weekend, space to foster a recovering patient, or corporate CSR resources, your action directly saves campus and community strays.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-14 space-y-16">
        {/* Pathway 1: Volunteer Shifts */}
        <section id="volunteer" className="space-y-6 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center bg-foreground text-background rounded-xl">
              <Users className="size-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Pathway 01</span>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
                Sanctuary Volunteering & Field Shifts
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-border bg-card p-6 rounded-2xl space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <h3 className="font-heading text-base font-bold text-foreground">
                  Weekend Dog Walking
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Every Saturday & Sunday, 10:00 AM – 12:00 PM. Walk and socialize shelter rescues in our outdoor exercise yard in Petaling Jaya.
              </p>
              <div className="pt-2 text-xs font-bold text-foreground/80">
                Commitment: 2 hours / session
              </div>
            </div>

            <div className="border border-border bg-card p-6 rounded-2xl space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="font-heading text-base font-bold text-foreground">
                  Bath & Grooming Days
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                2nd & 4th Saturdays of every month. Assist caregivers with medicated skin baths, ear cleaning, and brush-outs for recovering rescues.
              </p>
              <div className="pt-2 text-xs font-bold text-foreground/80">
                Commitment: Bi-weekly Saturdays
              </div>
            </div>

            <div className="border border-border bg-card p-6 rounded-2xl space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Truck className="size-4 text-primary" />
                <h3 className="font-heading text-base font-bold text-foreground">
                  Vet Clinic Transport
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Weekday morning/evening runs transporting rescued animals to partner vet clinics for spay/neuter surgery and follow-up checks.
              </p>
              <div className="pt-2 text-xs font-bold text-foreground/80">
                Requirement: Valid driving license & car
              </div>
            </div>
          </div>

          <div className="pt-2 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {volunteerFormUrl ? (
                <a
                  href={volunteerFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="volunteer-apply-cta"
                  className={buttonVariants({
                    className: "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl",
                  })}
                >
                  <ExternalLink className="size-4" />
                  Apply to Volunteer (Google Form)
                </a>
              ) : (
                <p
                  data-testid="volunteer-form-unconfigured"
                  className="text-xs sm:text-sm text-muted-foreground border border-dashed border-border rounded-xl px-4 py-3"
                >
                  Our online application form is being set up. In the meantime, message
                  our coordinator on WhatsApp.
                </p>
              )}

              <a
                href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20I%20would%20like%20to%20register%20as%20a%20volunteer%20for%20weekend%20shifts!`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="volunteer-whatsapp-cta"
                className={buttonVariants({
                  variant: volunteerFormUrl ? "outline" : "default",
                  className: volunteerFormUrl
                    ? "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl"
                    : "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-success-solid text-white hover:bg-success-solid",
                })}
              >
                <MessageCircle className="size-4" />
                WhatsApp Volunteer Coordinator
              </a>
            </div>

            {volunteerFormUrl && (
              <p className="text-xs text-muted-foreground">
                Minimum age 18. The form opens in a new tab and is hosted on Google Forms.
              </p>
            )}
          </div>
        </section>

        {/* Pathway 2: Foster Care */}
        <section id="foster" className="border-t border-border pt-14 space-y-6 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center bg-care-solid text-white rounded-xl">
              <HandHeart className="size-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-care-accent ">Pathway 02</span>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
                Temporary Foster & Post-Op Recovery Care
              </h2>
            </div>
          </div>

          <div className="border border-care-accent/30 bg-care-surface p-6 sm:p-8 rounded-3xl space-y-6">
            <p className="text-base text-foreground/90 max-w-3xl leading-relaxed">
              Fostering provides a calm home environment for vulnerable animals who cannot thrive in a shelter kennel. We provide <strong>100% of food, crates, medication, and veterinary bills</strong> — you provide love, safety, and observation.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-background border border-border p-4 rounded-2xl space-y-1.5">
                <p className="text-sm font-bold text-foreground">Post-Op Spay Recovery</p>
                <p className="text-xs text-muted-foreground">7–10 days of quiet indoor rest while surgical incisions heal.</p>
              </div>

              <div className="bg-background border border-border p-4 rounded-2xl space-y-1.5">
                <p className="text-sm font-bold text-foreground">Medical Isolation Foster</p>
                <p className="text-xs text-muted-foreground">2–4 weeks for mange therapy or orthopedic fracture rehabilitation.</p>
              </div>

              <div className="bg-background border border-border p-4 rounded-2xl space-y-1.5">
                <p className="text-sm font-bold text-foreground">Neonatal Nursery</p>
                <p className="text-xs text-muted-foreground">Bottle-feeding and caring for orphaned litters until 8 weeks old.</p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20I%20am%20interested%20in%20becoming%20a%20temporary%20foster%20parent.`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  className: "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-care-solid text-white hover:bg-care-solid",
                })}
              >
                <MessageCircle className="size-4" />
                WhatsApp Foster Care Team
              </a>
            </div>
          </div>
        </section>

        {/* Pathway 3: Corporate CSR */}
        <section id="corporate" className="border-t border-border pt-14 space-y-6 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center bg-warning-solid text-white rounded-xl">
              <Building2 className="size-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-warning-text ">Pathway 03</span>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
                Corporate CSR, University Clubs & Group Days
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-border bg-card p-6 rounded-2xl space-y-3 shadow-xs">
              <h3 className="font-heading text-lg font-bold text-foreground">
                Company Workdays & Sanctuary Refurbishment
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Bring your team for a half-day sanctuary working bee — assisting with kennel repainting, enrichment toy fabrication, yard deep-cleans, and animal socialization.
              </p>
              <div className="space-y-1.5 pt-2 text-xs text-foreground/90 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-primary" /> Group sizes: 8 to 25 participants
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-primary" /> Official participation certificate provided
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 rounded-2xl space-y-3 shadow-xs">
              <h3 className="font-heading text-lg font-bold text-foreground">
                Corporate Matching & LHDN Tax-Exempt Drives
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sponsor a monthly TNRM sterilization drive or equipment upgrade. All financial contributions are eligible for Malaysian <strong>LHDN Section 44(6) tax deductions</strong> under Society Registration {PUBLIC_ROS_REGISTRATION_NO}.
              </p>
              <div className="space-y-1.5 pt-2 text-xs text-foreground/90 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-primary" /> Official e-receipt emailed once your transfer is confirmed
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-primary" /> Brand logo credited in shelter bulletin
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <a
              href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20our%20organization%20would%20like%20to%20collaborate%20on%20a%20CSR%20event.`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                className: "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-warning-solid text-white hover:bg-warning-solid",
              })}
            >
              <MessageCircle className="size-4" />
              WhatsApp Corporate CSR Coordinator
            </a>
          </div>
        </section>

        {/* Pathway 4: Clinical & Community Partnerships */}
        <section id="partnerships" className="border-t border-border pt-14 space-y-6 scroll-mt-24">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center bg-info-solid text-white rounded-xl">
              <Stethoscope className="size-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-info-text ">Pathway 04</span>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
                Veterinary Clinics & Academic Partnerships
              </h2>
            </div>
          </div>

          <div className="border border-border bg-card p-6 sm:p-8 rounded-3xl space-y-5 shadow-xs">
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
              We collaborate with registered veterinary clinics across Petaling Jaya, Subang Jaya, and Kuala Lumpur, as well as Universiti Malaya student faculties. If you are a veterinary practitioner willing to offer subsidized spay/neuter surgery slots or academic researchers studying urban stray coexistence, we welcome you.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-border bg-background p-4 rounded-2xl flex items-start gap-3">
                <Stethoscope className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm space-y-1">
                  <p className="font-bold text-foreground">Veterinary Clinic Network</p>
                  <p className="text-muted-foreground">High-volume subsidized spay/neuter packages and emergency trauma triage.</p>
                </div>
              </div>

              <div className="border border-border bg-background p-4 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm space-y-1">
                  <p className="font-bold text-foreground">Faculty & Student Society MOUs</p>
                  <p className="text-muted-foreground">Joint educational seminars, campus feeder registries, and student volunteer credits.</p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20we%20would%20like%20to%20discuss%20a%20clinical%20or%20academic%20partnership.`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  className: "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-info-solid text-white hover:bg-info-solid",
                })}
              >
                <MessageCircle className="size-4" />
                WhatsApp Partnerships Liaison
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
