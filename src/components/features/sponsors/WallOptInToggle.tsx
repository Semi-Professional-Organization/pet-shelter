"use client";

import { useState, useTransition } from "react";
import { Globe2, Check, Loader2 } from "lucide-react";
import { updateWallPreferenceAction } from "@/actions/sponsors";
import { useLanguage } from "@/components/providers/LanguageProvider";

/**
 * Public Sponsor Wall opt-in, from inside the portal.
 *
 * Sends only the desired boolean — the server action reads the sponsor id from the
 * session cookie, so this control cannot be used to change anybody else's setting.
 */
export function WallOptInToggle({ initialValue }: { initialValue: boolean }) {
  const { isMs } = useLanguage();
  const [displayOnWall, setDisplayOnWall] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    const previous = displayOnWall;
    setDisplayOnWall(next);
    setError(null);

    startTransition(async () => {
      const result = await updateWallPreferenceAction(next);
      if (!result.success) {
        setDisplayOnWall(previous);
        setError(result.error ?? "Could not save your preference.");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={displayOnWall}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
        />
        <span className="space-y-1">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Globe2 className="size-4 text-primary-ink" aria-hidden />
            {isMs
              ? "Paparkan nama saya di Dinding Penaja awam Hope for Strays"
              : "Display my name on the Hope for Strays Public Sponsor Wall"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {isMs
              ? "Hanya nama dan taraf anda dipaparkan. Jumlah sumbangan, e-mel dan nombor cukai tidak sekali-kali dipaparkan."
              : "Only your name and standing appear. Amounts, email addresses and tax numbers are never shown."}
          </span>
        </span>
      </label>

      <div className="mt-3 flex min-h-5 items-center gap-1.5 pl-7 text-xs">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {isMs ? "Menyimpan…" : "Saving…"}
          </span>
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : displayOnWall ? (
          <span className="inline-flex items-center gap-1.5 text-primary-ink">
            <Check className="size-3" aria-hidden />
            {isMs ? "Anda kelihatan di /sponsors" : "You appear on /sponsors"}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {isMs ? "Penajaan anda kekal peribadi." : "Your sponsorship stays private."}
          </span>
        )}
      </div>
    </div>
  );
}
