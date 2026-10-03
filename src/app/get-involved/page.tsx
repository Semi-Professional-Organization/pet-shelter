// Read through the repository, not @/actions/settings: importing a "use server"
// export here would register it as a POST-reachable endpoint on this public route.
import { getServerSettingsAsync } from "@/lib/server/settingsRepository";
import { isUsableFormUrl } from "@/lib/volunteerFormUrl";
import { SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
import { Metadata } from "next";
import { Building2, Cat, CheckCircle2, Dog, ExternalLink, Hammer, MessageCircle, Paintbrush, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { Section, SectionHeader } from "@/components/layout/Section";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Get Involved — Volunteer, Corporate CSR & Partnerships | Hope for Strays UM",
  description:
    "Help the cats and dogs at the Hope for Strays sanctuary: volunteer in the cat or dog area or at an occasional project day, bring your company or club for a CSR day, or partner with us as a clinic or university.",
};

/**
 * Rendered per request so a volunteer form URL saved in /admin/settings is reflected
 * on the CTA immediately, without waiting for a rebuild.
 */
export const dynamic = "force-dynamic";

// Shared recipes from docs/page-style-guide.md §3 and §5.
const panel = "rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7";
const cardTitle = "font-heading text-xl font-bold tracking-tight text-foreground";
const cardBody = "text-sm leading-relaxed text-muted-foreground";
const iconTile = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground";
const innerTile = "space-y-1.5 rounded-xl border border-border bg-background p-4";
const groupLabel = "text-2xs font-bold uppercase tracking-wider text-primary";
const highlight = "flex items-start gap-2 text-sm font-medium text-foreground/90";
// Not buttonVariants: its default fill would clash with the brand colour (page-style-guide §8.1).
const whatsappButton =
  "inline-flex h-10 items-center gap-2 rounded-control bg-brand-whatsapp px-6 text-xs font-semibold uppercase tracking-widest text-white shadow-brand-xs transition-colors hover:bg-brand-whatsapp-hover";

function WhatsAppLink({ text, label, testId }: { text: string; label: string; testId?: string }) {
  return (
    <a
      href={`${SHELTER_WHATSAPP_URL}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className={whatsappButton}
    >
      <MessageCircle className="size-4" />
      {label}
    </a>
  );
}

export default async function GetInvolvedPage() {
  const settings = await getServerSettingsAsync();
  // "" when unset, still the shipped placeholder, or not an http(s) URL. Keeping an
  // unusable value out of the render means visitors get the WhatsApp fallback rather
  // than a dead primary button, and the placeholder never reaches the RSC payload.
  const rawFormUrl = settings.volunteerFormUrl ?? "";
  const volunteerFormUrl = isUsableFormUrl(rawFormUrl) ? rawFormUrl : "";

  return (
    <main className="flex min-h-screen flex-col">
      <Section className="pb-0 sm:pb-0">
        <div className="space-y-6">
          <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Get Involved
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Our cats and dogs are cared for by community hands. Volunteer with us, bring your company or club for a CSR day, or partner with us.
          </p>
        </div>
      </Section>

      {/* Volunteer — individuals: regular sessions, plus occasional project days. */}
      <Section id="volunteer" className="scroll-mt-24">
        <div className="space-y-10">
          <SectionHeader
            title="Volunteer"
            subtitle="Help care for the cats and dogs at our sanctuary, through regular sessions or occasional project days."
          />

          <div className="space-y-4">
            <p className={groupLabel}>Regular sessions — cleaning and feeding; choose the cat area, the dog area, or both</p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className={`${panel} flex flex-col gap-3`}>
                <div className={iconTile}>
                  <Cat className="size-5" />
                </div>
                <h3 className={cardTitle}>Cat Area</h3>
                <p className={cardBody}>Clean litter, bedding and bowls, then prepare meals and refill water for the cats.</p>
              </div>
              <div className={`${panel} flex flex-col gap-3`}>
                <div className={iconTile}>
                  <Dog className="size-5" />
                </div>
                <h3 className={cardTitle}>Dog Area</h3>
                <p className={cardBody}>Clean kennels, bedding and bowls, then prepare meals and refill water for the dogs.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className={groupLabel}>Occasional events — project days, no routine commitment</p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className={`${panel} flex flex-col gap-3`}>
                <div className={iconTile}>
                  <Paintbrush className="size-5" />
                </div>
                <h3 className={cardTitle}>Painting & Repairs</h3>
                <p className={cardBody}>Repaint kennels and fences and fix up the sanctuary.</p>
              </div>
              <div className={`${panel} flex flex-col gap-3`}>
                <div className={iconTile}>
                  <Hammer className="size-5" />
                </div>
                <h3 className={cardTitle}>Building Projects</h3>
                <p className={cardBody}>Build dog playhouses and other things the animals need.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {volunteerFormUrl ? (
                <a
                  href={volunteerFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="volunteer-apply-cta"
                  className={buttonVariants({ className: "gap-2" })}
                >
                  <ExternalLink className="size-4" />
                  Apply to Volunteer (Google Form)
                </a>
              ) : (
                <p
                  data-testid="volunteer-form-unconfigured"
                  className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
                >
                  Our online application form is being set up. In the meantime, message
                  our coordinator on WhatsApp.
                </p>
              )}

              <WhatsAppLink
                text="Hi Hope for Strays, I would like to volunteer."
                label="WhatsApp Volunteer Coordinator"
                testId="volunteer-whatsapp-cta"
              />
            </div>

            {volunteerFormUrl && (
              <p className="text-xs text-muted-foreground">
                Minimum age 18. The form opens in a new tab and is hosted on Google Forms.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Corporate CSR & Collaboration — organisations taking part as a group or as sponsors. */}
      <Section id="corporate" className="scroll-mt-24">
        <div className="space-y-10">
          <SectionHeader
            title="Corporate CSR & Collaboration"
            subtitle="Companies, university clubs and other organisations can volunteer together as a group or sponsor our work."
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className={`${panel} flex flex-col gap-3`}>
              <div className={iconTile}>
                <Users className="size-5" />
              </div>
              <h3 className={cardTitle}>Group Volunteer Days</h3>
              <p className={cardBody}>Bring your team for a project day at the sanctuary — painting, repairs and building for the animals.</p>
            </div>
            <div className={`${panel} flex flex-col gap-3`}>
              <div className={iconTile}>
                <Building2 className="size-5" />
              </div>
              <h3 className={cardTitle}>Company Sponsorship</h3>
              <p className={cardBody}>Sponsor a monthly TNRM sterilisation drive or an equipment upgrade.</p>
              <div className={innerTile}>
                <p className={highlight}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  Brand logo credited in the shelter bulletin
                </p>
              </div>
            </div>
          </div>

          <WhatsAppLink
            text="Hi Hope for Strays, our organisation would like to collaborate on a CSR activity."
            label="WhatsApp CSR Coordinator"
          />
        </div>
      </Section>

      {/* Partnerships — clinics and universities working with us on an ongoing basis. */}
      <Section id="partnerships" className="scroll-mt-24">
        <div className="space-y-10">
          <SectionHeader
            title="Partnerships"
            subtitle="We work with veterinary clinics across Petaling Jaya, Subang Jaya and Kuala Lumpur, and with Universiti Malaya faculties and student societies."
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className={`${panel} flex flex-col gap-3`}>
              <div className={iconTile}>
                <Stethoscope className="size-5" />
              </div>
              <h3 className={cardTitle}>Veterinary Clinics</h3>
              <p className={cardBody}>Subsidised spay/neuter slots and emergency trauma triage.</p>
            </div>
            <div className={`${panel} flex flex-col gap-3`}>
              <div className={iconTile}>
                <ShieldCheck className="size-5" />
              </div>
              <h3 className={cardTitle}>Universities & Student Societies</h3>
              <p className={cardBody}>Joint educational seminars, campus feeder registries, and research on urban stray coexistence.</p>
            </div>
          </div>

          <WhatsAppLink
            text="Hi Hope for Strays, we would like to discuss a partnership."
            label="WhatsApp Partnerships Liaison"
          />
        </div>
      </Section>
    </main>
  );
}
