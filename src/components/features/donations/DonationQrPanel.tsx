"use client";

import React, { useMemo, useState } from "react";
import {
  availableQrChannels,
  mergeQrSources,
  resolveDonationQr,
  QR_CHANNEL_PRESENTATION,
  type DonationQrSources,
  type QrChannel,
  type ShelterQrConfigLike,
} from "@/lib/domain/qrCode";
import { useDonationQrConfig } from "@/components/providers/DonationQrProvider";

/**
 * The donation QR panel shown on every public donation surface.
 *
 * This markup previously existed twice — the same seventeen hand-placed <rect>
 * elements in `DonationWidget` and in `SponsorshipModal` — so wiring a real QR
 * into one would have silently left the other showing a decorative fake. There
 * is one copy now, and both surfaces render it.
 *
 * Styling uses the receipt/brand design tokens rather than literal colours, so
 * collapsing the two copies changes no pixels.
 */

interface DonationQrPanelProps extends DonationQrSources {
  /**
   * Localised "scan with your banking app" line. Falls back to the selected
   * channel's own wording, which matters once the donor can switch rails.
   */
  instructions?: string;
  /** Tighter spacing for use inside the sponsorship modal. */
  compact?: boolean;
  className?: string;
  /**
   * Replaces the shelter config from `DonationQrProvider` wholesale.
   *
   * The admin preview passes the values currently in the form, including the
   * TNG and bank codes, so the donor view it shows reflects what is about to be
   * saved rather than what is already live.
   */
  configOverride?: ShelterQrConfigLike;
}

/**
 * The decorative stand-in used when the shelter has configured neither a QR
 * image nor a payment payload. It is not a scannable code and is marked
 * presentational so screen readers do not announce it as one.
 */
function PlaceholderQr() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full text-receipt-ink fill-current"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="30" height="30" fill="var(--receipt-ink)" />
      <rect x="5" y="5" width="20" height="20" fill="white" />
      <rect x="10" y="10" width="10" height="10" fill="var(--receipt-ink)" />

      <rect x="70" y="0" width="30" height="30" fill="var(--receipt-ink)" />
      <rect x="75" y="5" width="20" height="20" fill="white" />
      <rect x="80" y="10" width="10" height="10" fill="var(--receipt-ink)" />

      <rect x="0" y="70" width="30" height="30" fill="var(--receipt-ink)" />
      <rect x="5" y="75" width="20" height="20" fill="white" />
      <rect x="10" y="80" width="10" height="10" fill="var(--receipt-ink)" />

      <rect x="40" y="10" width="10" height="10" fill="var(--receipt-ink)" />
      <rect x="55" y="15" width="10" height="10" fill="var(--receipt-ink)" />
      <rect x="35" y="35" width="30" height="30" fill="var(--brand-duitnow)" />
      <rect x="42" y="42" width="16" height="16" fill="white" />
      <rect x="46" y="46" width="8" height="8" fill="var(--brand-duitnow)" />
      <rect x="70" y="45" width="10" height="10" fill="var(--receipt-ink)" />
      <rect x="45" y="75" width="10" height="10" fill="var(--receipt-ink)" />
      <rect x="65" y="75" width="25" height="15" fill="var(--receipt-ink)" />
    </svg>
  );
}

export function DonationQrPanel(props: DonationQrPanelProps) {
  const { instructions, compact = false, className = "" } = props;

  // Shelter-level values come from the provider unless a caller replaces them.
  // Individual `DonationQrSources` props still win over both, which is how the
  // pet dialog previews one animal against the live shelter config.
  const contextConfig = useDonationQrConfig();
  const config = props.configOverride ?? contextConfig;

  // `["duitnow"]` is the common case and the signal to render no switcher at
  // all, so a shelter with only a DuitNow code looks exactly as it did before
  // channels existed.
  const channels = availableQrChannels(config);
  const [selected, setSelected] = useState<QrChannel>("duitnow");
  // An admin can remove a channel while a donor has it selected.
  const channel = channels.includes(selected) ? selected : "duitnow";

  const sources = mergeQrSources(props, config, channel);
  // The generated branch runs a full QR encode over a ~57x57 module matrix.
  // This panel sits inside DonationWidget next to its pledge form, so without
  // memoising it would re-encode on every keystroke in that form.
  const resolved = useMemo(
    () => resolveDonationQr(sources),
    [
      channel,
      sources.petCustomQrUrl,
      sources.petName,
      sources.shelterQrUrl,
      sources.paymentPayload,
      sources.shelterName,
    ]
  );

  // A per-animal fund drive is one specific code, so it overrides the rails
  // entirely and the switcher is hidden while it is showing.
  const showSwitcher = channels.length > 1 && !resolved.isPetSpecific;
  const presentation =
    QR_CHANNEL_PRESENTATION[resolved.isPetSpecific ? "duitnow" : channel];
  const accent = presentation.accent;

  // Sizes and spacing mirror what each surface used before this component
  // absorbed both copies, so extracting the duplicate changes no pixels.
  const frameSize = compact ? "w-36 h-36" : "w-40 h-40";
  const titleSize = compact ? "text-3xs" : "text-xs";
  const captionSize = compact ? "text-3xs" : "text-xs";
  const subtitleGap = compact ? "mb-2" : "mb-2.5";
  const captionGap = compact ? "mt-2" : "mt-2.5";
  const shadow = compact ? "shadow-sm" : "shadow-xs";

  return (
    <div
      style={{ borderColor: accent }}
      className={`border-2 bg-receipt-paper text-receipt-ink ${
        compact ? "p-4" : "p-5"
      } rounded-xl flex flex-col items-center justify-center text-center ${shadow} ${className}`}
    >
      {showSwitcher && (
        <div
          role="tablist"
          aria-label="Payment method"
          className="mb-2 flex gap-1 rounded-lg bg-receipt-rule/40 p-0.5"
        >
          {channels.map((option) => {
            const isActive = option === channel;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelected(option)}
                style={
                  isActive
                    ? {
                        backgroundColor: QR_CHANNEL_PRESENTATION[option].accent,
                        color: "var(--receipt-paper)",
                      }
                    : undefined
                }
                className={`rounded-md px-2 py-1 text-3xs font-bold transition-colors ${
                  isActive ? "" : "text-receipt-ink-muted hover:text-receipt-ink"
                }`}
              >
                {QR_CHANNEL_PRESENTATION[option].label}
              </button>
            );
          })}
        </div>
      )}

      <div
        style={{ color: accent }}
        className={`${titleSize} font-extrabold uppercase tracking-widest mb-0.5`}
      >
        {presentation.label}
      </div>
      <div className={`text-3xs text-receipt-ink-muted font-semibold ${subtitleGap}`}>
        {presentation.subtitle}
      </div>

      <div
        className={`${frameSize} border border-receipt-rule p-2 bg-receipt-paper flex items-center justify-center relative rounded-md`}
      >
        {resolved.kind === "generated" ? (
          // Generated by `renderQrSvg` from our own module matrix — no caller
          // text reaches the markup, so there is nothing to sanitise here.
          <span
            className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: resolved.svg }}
          />
        ) : resolved.kind === "placeholder" ? (
          <PlaceholderQr />
        ) : (
          // Deliberately a plain <img>, not next/image. Two reasons: the
          // optimizer would re-encode the code, and lossy artefacts soften the
          // module edges a scanner thresholds on; and next/image gates remote
          // hosts on `images.remotePatterns`, which would silently break a QR
          // hosted anywhere an admin happens to paste. The URL is restricted by
          // `isSafeQrImageUrl` before it reaches here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolved.imageUrl}
            alt={`${presentation.label} code for ${resolved.caption}`}
            className="absolute inset-0 size-full object-contain p-1"
          />
        )}
      </div>

      <div className={`${captionSize} font-bold text-receipt-ink-soft ${captionGap}`}>
        {resolved.caption}
      </div>

      {resolved.isPetSpecific && (
        <div
          style={{
            color: accent,
            backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`,
          }}
          className="mt-1 inline-block rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-wide"
        >
          Dedicated fund drive
        </div>
      )}

      <div className="text-3xs text-receipt-ink-faint font-mono mt-0.5">
        {instructions ?? presentation.instructions}
      </div>

      {resolved.kind === "placeholder" && (
        <div className="text-3xs text-warning-text font-semibold mt-1">
          Sample image — no QR code has been configured yet.
        </div>
      )}
    </div>
  );
}
