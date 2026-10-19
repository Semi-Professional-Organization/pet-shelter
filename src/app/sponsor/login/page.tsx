import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSponsorContext } from "@/lib/domain/sponsorAccess";
import { SponsorAuthForm } from "@/components/features/sponsors";

export const metadata: Metadata = {
  title: "Sponsor Sign In | Hope for Strays",
  description:
    "Sign in to the Hope for Strays sponsor portal to follow your sponsored rescues, view your sponsorship tier and unlock exclusive updates.",
  robots: { index: false, follow: false },
};

export default async function SponsorLoginPage() {
  // Only a session that still names a sponsor goes on to the dashboard, which is
  // the test the dashboard applies. On the cookie alone, a sponsor whose record is
  // gone (deleted, or an offline-mode registration lost to a restart) was sent to
  // the dashboard, sent back here, and round again, with no page ever rendering.
  if (await getSponsorContext()) {
    redirect("/sponsor/dashboard");
  }

  return (
    <section className="w-full px-6 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center">
        <div className="max-w-md space-y-4 lg:pt-8">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Hope for Strays
          </p>
          <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Your sponsorship, followed all the way through
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The sponsor portal shows the rescues your giving supports, their live
            rehabilitation and medical status, and the privileges your standing has
            unlocked — from the public Sponsor Wall through to behind-the-scenes video
            diaries.
          </p>

          <dl className="space-y-3 border-t border-border pt-5 text-sm">
            <div>
              <dt className="font-bold text-foreground">Bronze</dt>
              <dd className="text-muted-foreground">
                Sponsor Wall listing and the quarterly rescue newsletter.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-foreground">Silver</dt>
              <dd className="text-muted-foreground">
                Everything in Bronze, plus monthly high-resolution photo albums and the
                annual e-Certificate.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-foreground">Gold</dt>
              <dd className="text-muted-foreground">
                Everything in Silver, plus behind-the-scenes video diaries, open day
                invitations and direct caretaker Q&amp;A.
              </dd>
            </div>
          </dl>
        </div>

        <SponsorAuthForm />
      </div>
    </section>
  );
}
