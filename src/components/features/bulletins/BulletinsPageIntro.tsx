"use client";

import { useTypedTranslation } from "@/components/providers/LanguageProvider";

/**
 * The `/bulletins` page heading and intro.
 *
 * A client component for the same reason `HomeGalleryLoading` is one: the page
 * is a Server Component and the reader's language is client state, so a page
 * cannot resolve its own copy without giving up static rendering.
 *
 * It exists because translating `BulletinFeed`'s chrome left this page with
 * Malay category chips and a Malay feed heading under an English `<h1>` — the
 * "Malay chips under an English title" state that
 * `tasks/decisions/2026-09-22-home-page-malay-stops-at-the-bulletin-admin-chrome.md`
 * calls worse than not translating at all. These two strings were the only
 * English left on the page, so moving them finishes it rather than shifting the
 * seam one level up.
 *
 * The copy comes from `bulletins.title` and `bulletins.subtitle`, which already
 * existed in both locales with no reader.
 */
export function BulletinsPageIntro() {
  const { t } = useTypedTranslation();

  return (
    <div className="mb-10">
      <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        {t("bulletins.title")}
      </h1>
      <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">
        {t("bulletins.subtitle")}
      </p>
    </div>
  );
}
