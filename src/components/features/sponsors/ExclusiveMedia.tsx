"use client";

import Image from "next/image";
import { Play, Camera, Calendar } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import type {
  ExclusiveGalleryItem,
  ExclusiveVideoItem,
} from "@/types/supporter";

/**
 * Presentational renderers for unlocked exclusive media.
 *
 * These only ever receive items that a gate has already released. They perform no
 * authorization of their own and must never be handed a catalogue to filter — filtering
 * in the browser would mean the locked items were shipped to it.
 */

export function ExclusiveGalleryGrid({
  items,
  petName,
}: {
  items: ExclusiveGalleryItem[];
  petName: string;
}) {
  const { isMs } = useLanguage();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isMs
          ? `Belum ada foto resolusi tinggi untuk ${petName}. Semak semula bulan depan.`
          : `No high-resolution frames for ${petName} yet — check back next month.`}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <figure
          key={item.id}
          className="group overflow-hidden rounded-2xl border border-border bg-card"
        >
          <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
            <Image
              src={item.url}
              alt={isMs ? item.captionMs : item.caption}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-102"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-foreground">
              <Camera className="size-3" aria-hidden />
              {isMs ? "Resolusi penuh" : "Full resolution"}
            </span>
          </div>
          <figcaption className="space-y-1 p-3">
            <p className="text-sm font-semibold leading-snug text-foreground">
              {isMs ? item.captionMs : item.caption}
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" aria-hidden />
              {item.capturedAt}
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ExclusiveVideoDiary({
  items,
  petName,
}: {
  items: ExclusiveVideoItem[];
  petName: string;
}) {
  const { isMs } = useLanguage();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isMs
          ? `Diari video ${petName} sedang dirakam. Episod pertama akan tiba tidak lama lagi.`
          : `${petName}'s video diary is still filming — the first episode lands soon.`}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => (
        <a
          key={item.id}
          // Built from the id rather than trusting a stored URL: the catalogue used to
          // hold /embed/ links, which open the chromeless iframe player in a new tab.
          href={`https://www.youtube.com/watch?v=${item.youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/40"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <Image
              src={item.thumbnailUrl}
              alt={isMs ? item.titleMs : item.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-102"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-background/85 text-primary-ink shadow-lg transition-transform duration-200 group-hover:scale-105">
                <Play className="size-6 fill-current" aria-hidden />
              </span>
            </span>
            <span className="absolute bottom-3 right-3 rounded-md bg-background/90 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-foreground">
              {item.durationLabel}
            </span>
          </div>
          <div className="space-y-1 p-4">
            <p className="font-heading text-base font-bold leading-snug text-foreground">
              {isMs ? item.titleMs : item.title}
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" aria-hidden />
              {item.recordedAt}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
