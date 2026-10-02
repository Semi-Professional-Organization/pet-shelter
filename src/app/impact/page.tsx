import Link from "next/link";
import { ArrowRight, BadgeDollarSign, HeartHandshake, PawPrint } from "lucide-react";
import { Section, SectionHeader } from "@/components/layout/Section";
import { buttonVariants } from "@/components/ui/button";

const summaryStats = [
  {
    label: "Total raised",
    value: "RM 182,400",
    detail: "Across 2025–2026 rescue operations",
  },
  {
    label: "Total donors",
    value: "1,248",
    detail: "Individuals, families, and companies",
  },
  {
    label: "Avg. gift",
    value: "RM 146",
    detail: "Typical one-time contribution",
  },
  {
    label: "Active sponsorships",
    value: "86",
    detail: "Pets cared for through ongoing support",
  },
];

const allocation = [
  { label: "Veterinary care", value: 46, amount: "RM 83,904" },
  { label: "Food & nutrition", value: 27, amount: "RM 49,248" },
  { label: "Shelter care", value: 16, amount: "RM 29,184" },
  { label: "Rescue transport", value: 8, amount: "RM 14,592" },
  { label: "Operations & admin", value: 3, amount: "RM 5,472" },
];

const recentUses = [
  {
    title: "Emergency surgery for Miko",
    amount: "RM 3,800",
    description: "Miko was treated for a severe leg injury after a traffic accident, including imaging, surgery, pain control, and post-op recovery care.",
  },
  {
    title: "Puppy milk & neonatal care",
    amount: "RM 1,450",
    description: "Four abandoned newborn kittens received replacement formula, warming support, medication, and round-the-clock foster care.",
  },
  {
    title: "Weekly feeding support",
    amount: "RM 2,200",
    description: "A full month of high-protein kibble, wet food, and nutrition supplements for 18 dogs in foster and shelter care.",
  },
  {
    title: "Sterilisation & vaccine drive",
    amount: "RM 4,900",
    description: "A mass community clinic funded vaccine boosters, spay-neuter surgeries, and recovery monitoring for 19 rescue animals.",
  },
  {
    title: "Sanctuary sanitation upgrades",
    amount: "RM 1,120",
    description: "Refreshed cleaning supplies, disinfectants, and bedding materials to protect the shelter during the wet season.",
  },
];

// The home-page panel (docs/page-style-guide.md §5).
const panel = "rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7";
const eyebrow = "text-2xs font-bold uppercase tracking-wider text-primary";
const statLabel = "text-xs font-bold uppercase tracking-wider text-muted-foreground";
const pill = "inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground";
const iconTile = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground";

export default function ImpactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Section>
        <div className="space-y-12">
          <div className="space-y-6">
            <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Our Impact
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Where your support goes: every donation helps fund rescue, treatment, shelter care, and long-term recovery for stray dogs and cats.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {summaryStats.map((stat) => (
              <div key={stat.label} className={`${panel} flex flex-col gap-3`}>
                <p className={statLabel}>{stat.label}</p>
                <p className="font-heading text-3xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="space-y-6">
          <div className={`${panel} space-y-6`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <p className={eyebrow}>Fundraising campaign</p>
                <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">Emergency rescue fund</h2>
              </div>
              <span className={pill}>RM 24,000 raised / RM 30,000 goal</span>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
              <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-5 lg:col-span-8">
                <div className="flex items-center gap-3">
                  <div className={iconTile}>
                    <PawPrint className="size-5" />
                  </div>
                  <div>
                    <p className={statLabel}>Goal progress</p>
                    <p className="font-heading text-3xl font-bold tracking-tight text-foreground">80%</p>
                  </div>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Emergency rescue fund progress"
                  aria-valuenow={80}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: "80%" }} />
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Raised so far: RM 24,000</span>
                  <span>Goal: RM 30,000</span>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-background p-5 lg:col-span-4">
                <p className={statLabel}>Purpose</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This campaign supports emergency trauma treatment, transport, and short-term recovery for road-accident and neglected rescues.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className={`${panel} space-y-6 lg:col-span-7`}>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="space-y-2">
                  <p className={eyebrow}>Allocation</p>
                  <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">Where the money goes</h2>
                </div>
                <span className={pill}>FY 2025–2026</span>
              </div>

              <div className="space-y-6">
                {allocation.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm text-foreground">
                      <span className="font-semibold">{item.label}</span>
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{item.amount}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-5">
              <div className={`${panel} flex-1 space-y-4`}>
                <div className="flex items-center gap-3">
                  <div className={iconTile}>
                    <BadgeDollarSign className="size-5" />
                  </div>
                  <div>
                    <p className={statLabel}>Current balance</p>
                    <p className="font-heading text-2xl font-bold text-foreground">RM 14,280</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This amount sits in a dedicated rescue fund for urgent cases, post-op medication, food shortages, and emergency transport.
                </p>
              </div>

              <div className={`${panel} flex-1 space-y-4`}>
                <div className="flex items-center gap-3">
                  <div className={iconTile}>
                    <PawPrint className="size-5" />
                  </div>
                  <div>
                    <p className={statLabel}>Animals helped</p>
                    <p className="font-heading text-2xl font-bold text-foreground">420+</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Rescued, treated, fed, vaccinated, and placed into safe homes over the last year.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <div className="space-y-12">
          <SectionHeader
            title="Your gift at work"
            subtitle="A few recent, specific uses of donated funds."
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {recentUses.map((item) => (
              <div key={item.title} className={`${panel} flex h-full flex-col gap-3`}>
                <div className="flex items-start justify-between gap-3 pb-1">
                  <div className={iconTile}>
                    <HeartHandshake className="size-5" />
                  </div>
                  <span className={pill}>{item.amount}</span>
                </div>
                <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="space-y-10">
          <SectionHeader
            title="Your care helps animals recover, heal, and find homes."
            subtitle="We publish these figures to keep every donor informed about how support is allocated and where it creates the most immediate impact."
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Link href="/donate" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              Support the rescue fund
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/pets" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Meet the animals
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
