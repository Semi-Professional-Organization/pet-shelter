"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useCarousel } from "@/components/ui/carousel";
import { useTypedTranslation } from "@/components/providers/LanguageProvider";

/**
 * One mark per notice under the home carousel: a dot for each, stretched into a line for the
 * one showing, so a reader sees how many there are and where they are in the run.
 *
 * `total` comes from the server rather than from Embla, so the marks are in the served HTML and
 * do not pop in after hydration. The selected index is read through `useSyncExternalStore`
 * because Embla is an external store — syncing it with `setState` in an effect is the cascading
 * render the React Compiler lint rejects.
 *
 * Every mark is ink, not the light-blue fill: they are controls, and WCAG 1.4.11 wants 3:1
 * against the cream ground, which `--primary` (1.6:1) cannot give. The current one differs by
 * shape as well as `aria-current`, never by colour alone. Each button is a 24px target (WCAG
 * 2.5.8) around a smaller visible mark.
 */
export function BulletinCarouselDots({ total }: { total: number }) {
  const { api } = useCarousel();
  const { t } = useTypedTranslation();

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!api) return () => {};
      api.on("select", onChange).on("reInit", onChange);
      return () => {
        api.off("select", onChange).off("reInit", onChange);
      };
    },
    [api]
  );
  const selected = useSyncExternalStore(
    subscribe,
    () => api?.selectedScrollSnap() ?? 0,
    () => 0
  );

  return (
    <div className="mt-6 flex items-center justify-center gap-1">
      {Array.from({ length: total }, (_, index) => {
        const current = index === selected;
        return (
          <button
            key={index}
            type="button"
            onClick={() => api?.scrollTo(index)}
            aria-label={t("bulletins.goToNotice", { n: index + 1, total })}
            aria-current={current ? "true" : undefined}
            className="flex h-6 min-w-6 items-center justify-center rounded-full"
          >
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full bg-primary-ink transition-all duration-300 ${
                current ? "w-8" : "w-1.5"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
