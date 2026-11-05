import type { Metadata } from "next";
import { TransparencyPageView } from "@/components/features/transparency";
import { readTransparencySnapshot } from "@/lib/server/transparencyRepository";

export const metadata: Metadata = {
  title: "Where Your Money Goes | Hope for Strays",
  description:
    "See exactly how Hope for Strays spends every ringgit: a verified expense ledger, live allocation breakdown, impact figures, and downloadable financial statements.",
  alternates: { canonical: "/transparency" },
};

/**
 * Time-based backstop. Admin edits revalidate this path immediately via the
 * transparency actions; this ceiling means a build-time prerender (which may
 * have rendered the offline fallback if the database was unreachable) can never
 * be served as the current ledger for longer than five minutes.
 */
export const revalidate = 300;

/**
 * Server Component: the ledger is read on the server so the allocation the
 * reader sees is derived at render time, and admin edits surface here as soon
 * as the transparency actions revalidate this path.
 */
export default async function TransparencyPage() {
  const snapshot = await readTransparencySnapshot();
  return <TransparencyPageView snapshot={snapshot} />;
}
