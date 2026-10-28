"use client";

import { useEffect, useState } from "react";
import { Film, Images, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { UpgradeNudge } from "./UpgradeNudge";
import { ExclusiveGalleryGrid, ExclusiveVideoDiary } from "./ExclusiveMedia";
import type { PetExclusiveMediaResponse } from "@/types/supporter";

interface PetExclusiveMediaPanelProps {
  petId: string;
  petName: string;
}

/**
 * Sponsor-exclusive media on a public pet profile.
 *
 * Fetches from `/api/sponsor/pet-media/[petId]` rather than receiving media as props,
 * which buys two things at once:
 *
 *  - `src/app/pets/[id]/page.tsx` keeps its `generateStaticParams` prerendering, because
 *    nothing in the page's render tree reads cookies.
 *  - Locked media is never in the page at all. There is no hidden element to unhide and
 *    no RSC payload entry to read — an under-tier visitor's response genuinely does not
 *    contain the URLs.
 */
export function PetExclusiveMediaPanel({ petId, petName }: PetExclusiveMediaPanelProps) {
  const { isMs } = useLanguage();
  const [media, setMedia] = useState<PetExclusiveMediaResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/sponsor/pet-media/${encodeURIComponent(petId)}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json() as Promise<PetExclusiveMediaResponse>;
      })
      .then(setMedia)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFailed(true);
      });

    return () => controller.abort();
  }, [petId]);

  if (failed) return null;

  return (
    <section
      aria-labelledby="sponsor-exclusive-heading"
      className="space-y-8 rounded-3xl border border-border bg-card p-6 sm:p-8"
    >
      <div className="space-y-1">
        <p className="text-2xs font-bold uppercase tracking-widest text-primary-ink">
          {isMs ? "Untuk penaja" : "For sponsors"}
        </p>
        <h2
          id="sponsor-exclusive-heading"
          className="font-heading text-2xl font-bold text-foreground"
        >
          {isMs ? `Kemas kini eksklusif ${petName}` : `${petName}'s exclusive updates`}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {isMs
            ? "Album pemulihan resolusi tinggi dan diari video di sebalik tabir, dibuka mengikut taraf penajaan anda."
            : "High-resolution recovery albums and behind-the-scenes video diaries, unlocked by your sponsorship standing."}
        </p>
      </div>

      {!media ? (
        <div
          role="status"
          className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {isMs ? "Menyemak taraf penajaan anda…" : "Checking your sponsorship standing…"}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-4">
            <h3 className="inline-flex items-center gap-2 font-heading text-base font-bold text-foreground">
              <Images className="size-4 text-primary-ink" aria-hidden />
              {isMs ? "Album pemulihan resolusi tinggi" : "High-resolution recovery album"}
            </h3>
            {media.gallery.locked ? (
              <UpgradeNudge
                requiredTier={media.gallery.requiredTier}
                currentTier={media.gallery.currentTier}
                petName={petName}
                perkDescription="high-resolution recovery album"
                perkDescriptionMs="album pemulihan resolusi tinggi"
                lockedCount={media.gallery.lockedCount}
              />
            ) : (
              <ExclusiveGalleryGrid items={media.gallery.items} petName={petName} />
            )}
          </div>

          <div className="space-y-4">
            <h3 className="inline-flex items-center gap-2 font-heading text-base font-bold text-foreground">
              <Film className="size-4 text-primary-ink" aria-hidden />
              {isMs ? "Diari video pemulihan" : "Rehabilitation video diary"}
            </h3>
            {media.videoDiary.locked ? (
              <UpgradeNudge
                requiredTier={media.videoDiary.requiredTier}
                currentTier={media.videoDiary.currentTier}
                petName={petName}
                perkDescription="rehabilitation video diary"
                perkDescriptionMs="diari video pemulihan"
                lockedCount={media.videoDiary.lockedCount}
              />
            ) : (
              <ExclusiveVideoDiary items={media.videoDiary.items} petName={petName} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
