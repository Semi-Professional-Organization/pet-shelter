"use client";

import { useTypedTranslation } from "@/components/providers/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * One dictionary string, resolved in the reader's language.
 *
 * For Server Components that carry a few fixed labels — `BulletinFeed` is one.
 * The reader's language is client state, so a Server Component cannot resolve
 * its own copy; making the whole component a client one to do it would ship its
 * markup and data to the browser and undo a deliberately server-only render.
 * This leaf keeps the boundary at the string. It renders English on the server,
 * then the chosen language after hydration — the same seam every translated
 * component here has: `tasks/open/served-html-is-english-whatever-language-the-reader-chose.md`.
 */
export function Translated({ k }: { k: TranslationKey }) {
  const { t } = useTypedTranslation();
  return <>{t(k)}</>;
}
