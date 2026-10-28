import { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { getSponsorWall } from "@/lib/domain/sponsorAccess";
import { buttonVariants } from "@/components/ui/button";
import { SponsorWallGrid } from "@/components/features/sponsors";
import { SupporterTier } from "@/types/supporter";

export const metadata: Metadata = {
  title: "Public Sponsor Wall | Hope for Strays Selangor",
  description:
    "The Bronze, Silver and Gold supporters whose recurring sponsorship funds veterinary care, nutrition and rehabilitation for stray animals across Selangor.",
  openGraph: {
    title: "Hope for Strays Public Sponsor Wall",
    description:
      "Meet the community of Bronze, Silver and Gold sponsors funding stray rescue in Selangor.",
    url: "https://hopeforstrays.org/sponsors",
    siteName: "Hope for Strays Sanctuary",
    type: "website",
  },
};

const TIER_ORDER: SupporterTier[] = ["GOLD", "SILVER", "BRONZE"];

/**
 * Rendered per request rather than prerendered.
 *
 * The wall changes on two unrelated events — a sponsor toggling their opt-in, and any
 * pledge that pushes someone over a threshold — and only the first of those revalidates
 * this path. A baked-in wall would silently show a stale roll of supporters, which is the
 * one thing a recognition page must not do.
 */
export const dynamic = "force-dynamic";

/**
 * The public Sponsor Wall.
 *
 * `getSponsorWall` applies both required filters server-side — the sponsor opted in, and
 * the sponsor holds a standing — and projects to name plus tier. Amounts, email
 * addresses, tax identifiers and pet dedications never reach this page.
 */
export default async function SponsorWallPage() {
  const wall = await getSponsorWall();
  const total = TIER_ORDER.reduce((sum, tier) => sum + wall[tier].length, 0);

  return (
    <section className="w-full px-6 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="mx-auto max-w-3xl space-y-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-ink">
            Hope for Strays
          </p>
          <h1 className="font-heading text-4xl font-bold text-foreground sm:text-5xl">
            Public Sponsor Wall
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Every name here chose to be listed. Their sponsorship pays for the surgeries,
            vaccinations, kibble and rehabilitation that carry a stray from intake to a
            home.
          </p>
          <p className="text-sm text-muted-foreground">
            Only names and standings are shown — never amounts, contact details or tax
            numbers.
          </p>
        </header>

        {total === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <Heart className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              No sponsors have opted in to the wall yet. Be the first name on it.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {TIER_ORDER.map((tier) => (
              <SponsorWallGrid key={tier} tier={tier} entries={wall[tier]} />
            ))}
          </div>
        )}

        <div className="rounded-3xl border border-border bg-card p-8 text-center sm:p-10">
          <h2 className="font-heading text-2xl font-bold text-foreground">
            Add your name to the wall
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Sponsor a rescue and tick the Sponsor Wall option at checkout. You can change
            your mind at any time from the sponsor portal.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/donate" className={buttonVariants({ className: "font-bold" })}>
              Sponsor a rescue
            </Link>
            <Link
              href="/sponsor/dashboard"
              className={buttonVariants({ variant: "outline" })}
            >
              Sponsor portal
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
