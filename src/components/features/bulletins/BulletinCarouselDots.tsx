"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCarousel } from "@/components/ui/carousel";
import { useTypedTranslation } from "@/components/providers/LanguageProvider";

/**
 * Position marks beside the home carousel's arrows: a dot per notice, stretched into a line for the
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
 *
 * At most `WINDOW` marks show at once, however many notices there are, so the title row has a
 * fixed width. The current notice's line sits in the middle mark, so the window moves with every
 * step, except near either end, where it stops and the line moves toward that end. An end mark
 * fades while more notices lie beyond it: smaller, and at 75% opacity, the lowest that keeps a
 * control at 3:1 on the page ground (3.42:1 on #fff7df; 6.39:1 on #111827 in dark, measured).
 * The five buttons are keyed by slot, not by notice, so sliding the window relabels them in place
 * and a focused mark keeps focus instead of being unmounted from under it.
 *
 * A step in the middle plays in two beats, so the row visibly moves: the line first passes to the
 * next mark inside the window as it stands, then the window re-centres, the row gliding one pitch
 * back while every mark keeps the notice it showed. The glide starts with the row offset by the
 * distance it moved and its marks' own transitions off, so nothing jumps. A move that lands
 * outside the window (a wrap, a jump) snaps without either beat, and reduced motion skips both.
 * The row clips only while gliding, and pads by the focus ring's 4px reach (offset by negative
 * margins, so nothing moves) so a focused mark keeps its whole ring through the glide.
 */
const WINDOW = 5;
/** Slot pitch in px: an `h-6 min-w-6` button plus the row's `gap-1`. */
const PITCH = 28;
const BEAT_MS = 300;

function centred(selected: number, total: number) {
  return Math.min(Math.max(selected - Math.floor(WINDOW / 2), 0), Math.max(0, total - WINDOW));
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

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

  const target = centred(selected, total);
  // The window as drawn. It trails `target` by one beat; storing it is React's "information from
  // previous renders" pattern, and it snaps during render when the selection has left it.
  const [first, setFirst] = useState(target);
  if (selected < first || selected >= first + WINDOW) setFirst(target);
  const drawnFirst = selected < first || selected >= first + WINDOW ? target : first;

  useEffect(() => {
    if (drawnFirst === target) return;
    const id = window.setTimeout(() => setFirst(target), prefersReducedMotion() ? 0 : BEAT_MS);
    return () => window.clearTimeout(id);
  }, [drawnFirst, target]);

  const rowRef = useRef<HTMLDivElement>(null);
  const previousFirst = useRef(drawnFirst);
  useLayoutEffect(() => {
    const moved = drawnFirst - previousFirst.current;
    previousFirst.current = drawnFirst;
    const row = rowRef.current;
    if (!row || Math.abs(moved) === 0 || Math.abs(moved) > 2 || prefersReducedMotion()) return;
    row.dataset.gliding = "true";
    const glide = row.animate(
      [{ transform: `translateX(${moved * PITCH}px)` }, { transform: "translateX(0)" }],
      { duration: BEAT_MS, easing: "ease-out" }
    );
    const done = () => delete row.dataset.gliding;
    glide.onfinish = done;
    glide.oncancel = done;
  }, [drawnFirst]);

  const shown = Array.from({ length: Math.min(total, WINDOW) }, (_, offset) => drawnFirst + offset);

  return (
    <div ref={rowRef} className="group/marks -my-1 -ml-1 mr-1 flex items-center gap-1 p-1 data-[gliding=true]:overflow-hidden">
      {shown.map((index, offset) => {
        const current = index === selected;
        const moreBeyond =
          (offset === 0 && index > 0) || (offset === shown.length - 1 && index < total - 1);
        return (
          <button
            key={offset}
            type="button"
            onClick={() => api?.scrollTo(index)}
            aria-label={t("bulletins.goToNotice", { n: index + 1, total })}
            aria-current={current ? "true" : undefined}
            className="flex h-6 min-w-6 items-center justify-center rounded-full"
          >
            <span
              aria-hidden="true"
              className={`block rounded-full bg-primary-ink transition-all duration-300 motion-reduce:transition-none group-data-[gliding=true]/marks:transition-none ${
                current ? "h-1.5 w-8" : moreBeyond ? "size-1 opacity-75" : "size-1.5"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
