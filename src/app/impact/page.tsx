import Link from "next/link";
import { ArrowRight, BadgeDollarSign, HeartHandshake, Hospital, PawPrint, ShieldCheck } from "lucide-react";

function GiftAtWorkIllustration({ tint }: { tint: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-background p-3" style={{ background: tint }}>
      <div className="absolute right-3 top-3 h-16 w-16 rounded-full bg-white/45 blur-2xl" />
      <svg viewBox="0 0 260 150" className="relative h-28 w-full" aria-label="Illustration of rescued pets receiving care" role="img">
        <rect x="0" y="0" width="260" height="150" rx="16" fill="rgba(255,255,255,0.18)" />
        <circle cx="202" cy="34" r="18" fill="rgba(255,255,255,0.52)" />
        <path d="M40 88c0-18 14-32 32-32h40c18 0 32 14 32 32v18c0 7-6 13-13 13H53c-7 0-13-6-13-13V88Z" fill="#f7b267" opacity="0.9" />
        <path d="M78 62 88 42l10 20h-20Z" fill="#f3c98b" opacity="0.85" />
        <path d="M112 62 122 42l10 20h-20Z" fill="#f3c98b" opacity="0.85" />
        <circle cx="88" cy="92" r="6" fill="#1f2937" />
        <circle cx="122" cy="92" r="6" fill="#1f2937" />
        <path d="M94 106c4 5 10 8 16 8s12-3 16-8" fill="none" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
        <circle cx="156" cy="76" r="14" fill="#ffd6a5" />
        <circle cx="150" cy="74" r="2.5" fill="#1f2937" />
        <circle cx="162" cy="74" r="2.5" fill="#1f2937" />
        <path d="M150 83c4 5 8 6 12 6s8-1 12-6" fill="none" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
        <rect x="177" y="64" width="35" height="20" rx="8" fill="#ffffff" opacity="0.9" />
        <path d="M183 68h23" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
        <path d="M183 74h16" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
        <path d="M196 86v24" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
        <path d="M189 90h14" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
        <path d="M53 124c12-8 26-11 39-11s28 3 39 11" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
        <path d="M175 124c10-7 19-10 30-10 12 0 23 3 33 10" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      </svg>
    </div>
  );
}

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

export default function ImpactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-page-warm">
      <section className="py-14 sm:py-18">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              <ShieldCheck className="size-3.5" />
              Financial transparency
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Where your support goes
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Every donation helps fund rescue, treatment, shelter care, and long-term recovery for stray dogs and cats in Selangor.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {summaryStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <p className="mt-3 font-heading text-3xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-18">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 lg:px-12">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Fundraising campaign</p>
                <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Emergency rescue fund
                </h2>
              </div>
              <div className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                RM 24,000 raised / RM 30,000 goal
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
              <div className="rounded-[28px] border border-primary/20 bg-gradient-to-r from-primary/10 via-rose-100 to-amber-50 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-white/80 text-primary shadow-sm">
                      <PawPrint className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Goal progress</p>
                      <p className="font-heading text-4xl font-bold tracking-tight text-foreground">80%</p>
                    </div>
                  </div>
                  <div className="rounded-full border border-primary/20 bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                    RM 24,000
                  </div>
                </div>

                <div className="mt-6 h-5 overflow-hidden rounded-full bg-white/60 shadow-inner ring-1 ring-primary/10">
                  <div className="relative h-full rounded-full bg-gradient-to-r from-primary via-primary to-amber-300" style={{ width: "80%" }}>
                    <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-[10px] text-primary-foreground/90">
                      <span className="rounded-full bg-white/30 px-1.5 py-0.5">♥</span>
                      <span className="rounded-full bg-white/30 px-1.5 py-0.5">🐾</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Raised so far</span>
                  <span>Goal: RM 30,000</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Purpose</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  This campaign supports emergency trauma treatment, transport, and short-term recovery for road-accident and neglected rescues.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-18">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-12">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="mb-7 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Allocation</p>
                <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground">Where the money goes</h2>
              </div>
              <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                FY 2025–2026
              </div>
            </div>

            <div className="space-y-6">
              {allocation.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm text-foreground">
                    <span className="font-semibold">{item.label}</span>
                    <span className="font-mono text-xs font-semibold text-muted-foreground">{item.amount}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BadgeDollarSign className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current balance</p>
                  <p className="font-heading text-2xl font-bold text-foreground">RM 14,280</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This amount sits in a dedicated rescue fund for urgent cases, post-op medication, food shortages, and emergency transport.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success">
                  <PawPrint className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Animals helped</p>
                  <p className="font-heading text-2xl font-bold text-foreground">420+</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Rescued, treated, fed, vaccinated, and placed into safe homes over the last year.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-18">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 lg:px-12">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Your gift at work</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              A few recent, specific uses of donated funds
            </h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {recentUses.map((item) => (
              <div key={item.title} className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-xs">
                <div className="mb-4">
                  <GiftAtWorkIllustration tint={item.title.includes("surgery") ? "linear-gradient(135deg, rgba(251,146,60,0.22), rgba(255,255,255,0.7))" : item.title.includes("milk") ? "linear-gradient(135deg, rgba(244,114,182,0.18), rgba(255,255,255,0.7))" : item.title.includes("feeding") ? "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(255,255,255,0.7))" : item.title.includes("Sterilisation") ? "linear-gradient(135deg, rgba(16,185,129,0.16), rgba(255,255,255,0.7))" : "linear-gradient(135deg, rgba(168,85,247,0.14), rgba(255,255,255,0.7))"} />
                </div>

                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <HeartHandshake className="size-5" />
                  </div>
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {item.amount}
                  </span>
                </div>

                <h3 className="font-heading text-lg font-bold text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-18">
        <div className="mx-auto w-full max-w-4xl px-6 text-center sm:px-8 lg:px-12">
          <div className="mb-5 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Hospital className="size-6" />
            </div>
          </div>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Your care helps animals recover, heal, and find homes.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
            We publish these figures to keep every donor informed about how support is allocated and where it creates the most immediate impact.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/donate"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Support the rescue fund
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/pets"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-muted/50"
            >
              Meet the animals
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
