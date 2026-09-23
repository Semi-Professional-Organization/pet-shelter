import React from "react";
import Image from "next/image";
import { Pin, Calendar } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import { Bulletin } from "@/types/bulletin";
import type { TranslationKey } from "@/lib/i18n/translations";
import { presentBulletinCategory } from "@/lib/presentation/bulletinPresentation";
import { Translated } from "@/components/providers/Translated";

interface BulletinFeedProps {
  /**
   * Already filtered, sorted and limited by `getPublicBulletins` on the server.
   *
   * The page reads and this component renders, matching how `PetsFaqSection`
   * takes `initialFaqs` and `PetGallery` takes `initialPets`. It also means the
   * home page can fold its bulletin read into the `Promise.all` it already runs
   * rather than serialising a second round trip behind it.
   */
  bulletins: Bulletin[];
  /**
   * Dictionary key for the heading, not the heading itself, so the Malay site
   * reads Malay. Required: a default would let a shared component own one
   * page's heading, and any caller that forgot the prop would be headed with it.
   */
  titleKey: TranslationKey;
  /** Dictionary key for an optional line under the heading, for the same reason as `titleKey`. */
  subtitleKey?: TranslationKey;
  /** "grid" is the default two-up card grid. "lead" shows one large story beside a
   *  thumbnail rail. "carousel" shows one story at a time behind prev/next arrows —
   *  both of the latter keep the copy on the page ground rather than inside a card. */
  layout?: "grid" | "lead" | "carousel";
  compact?: boolean;
}

/**
 * The public bulletin feed, on `/`, `/pets` and `/bulletins`.
 *
 * A Server Component with no client state, deliberately. What was here before:
 * a `"use client"` component over a localStorage hook, rendering a "Staff Admin
 * Access" button to every visitor with no session check — anyone could open it
 * and edit, pin or delete notices in their own browser. Nothing staff posted
 * ever reached a visitor, and the initialiser preferred stored data forever, so
 * a redeployed fixture never reached a returning browser either.
 *
 * Editing now lives at `/admin/bulletins`, behind `MANAGE_CONTENT`. There is no
 * admin affordance on this component at all: not a hidden one, not a
 * session-gated one. A staff control on a public page is how the previous
 * version went wrong, and a feed that only ever reads cannot repeat it.
 *
 * Its fixed labels — heading, category chip, "Pinned", "Posted by", the empty
 * state — go through `Translated`, a client leaf per string, so the feed stays
 * a Server Component. The carousel layout is the same arrangement one size up:
 * `Carousel` is a client leaf that only scrolls what the server rendered. The notices themselves render in English: `titleMs` and
 * `contentMs` are stored and editable, but the public `Bulletin` does not carry
 * them yet: `tasks/open/bulletin-malay-text-is-stored-but-not-rendered.md`.
 */
export function BulletinFeed({
  bulletins,
  titleKey,
  subtitleKey,
  layout = "grid",
  compact = false,
}: BulletinFeedProps) {
  return (
    <section className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 mb-6">
        <div className="max-w-2xl space-y-3">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            <Translated k={titleKey} />
          </h2>
          {subtitleKey && (
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              <Translated k={subtitleKey} />
            </p>
          )}
        </div>
      </div>

      {bulletins.length > 0 && layout === "carousel" ? (
        /* One story at a time. The frame holds only the image; the copy sits on the page
           ground beneath it, so this is not a rounded box like everything around it.
           Embla gives touch dragging for free, so the arrows are not the only way through. */
        <Carousel opts={{ loop: bulletins.length > 1 }} className="w-full">
          <div className="mb-5 flex items-center justify-end gap-2">
            <CarouselPrevious className="static translate-y-0 size-9" />
            <CarouselNext className="static translate-y-0 size-9" />
          </div>
          <CarouselContent>
            {bulletins.map((bulletin) => {
              const cat = presentBulletinCategory(bulletin.category);
              return (
                <CarouselItem key={bulletin.id}>
                  <article className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-10">
                    {bulletin.mediaType === "video" && bulletin.videoEmbedUrl ? (
                      <div className="relative aspect-16/9 w-full overflow-hidden rounded-3xl border border-border bg-black">
                        <iframe
                          src={bulletin.videoEmbedUrl}
                          title={bulletin.title}
                          className="h-full w-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                    ) : bulletin.mediaType === "image" && bulletin.mediaUrl ? (
                      <div className="relative aspect-16/9 w-full overflow-hidden rounded-3xl border border-border bg-muted">
                        <Image src={bulletin.mediaUrl} alt={bulletin.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
                      </div>
                    ) : (
                      <div className="aspect-16/9 w-full rounded-3xl border border-border bg-muted" />
                    )}

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`tone-chip px-3 py-1 ${cat.toneClass}`}>
                          <Translated k={cat.labelKey} />
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-muted-foreground">
                          <Calendar className="size-3.5" />
                          {bulletin.publishedAt}
                        </span>
                      </div>
                      <h3 className="font-heading text-xl sm:text-2xl font-bold leading-snug tracking-tight text-foreground">
                        {bulletin.title}
                      </h3>
                      <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {bulletin.content}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <Translated k="bulletins.postedBy" />{" "}
                        <strong className="text-foreground">{bulletin.authorName}</strong>
                      </p>
                    </div>
                  </article>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      ) : bulletins.length > 0 && layout === "lead" ? (
        (() => {
          const [lead, ...rest] = bulletins;
          const leadCat = presentBulletinCategory(lead.category);
          return (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
              {/* Lead story. The frame holds only the image; the copy sits on the page
                  ground beneath it, so the section is not four identical rounded boxes. */}
              <article className="space-y-4">
                {lead.mediaType === "video" && lead.videoEmbedUrl ? (
                  <div className="relative aspect-16/9 w-full overflow-hidden rounded-3xl border border-border bg-black">
                    <iframe
                      src={lead.videoEmbedUrl}
                      title={lead.title}
                      className="h-full w-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                ) : lead.mediaType === "image" && lead.mediaUrl ? (
                  <div className="relative aspect-16/9 w-full overflow-hidden rounded-3xl border border-border bg-muted">
                    <Image src={lead.mediaUrl} alt={lead.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 60vw" />
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`tone-chip px-3 py-1 ${leadCat.toneClass}`}>
                      <Translated k={leadCat.labelKey} />
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-muted-foreground">
                      <Calendar className="size-3.5" />
                      {lead.publishedAt}
                    </span>
                  </div>
                  <h3 className="font-heading text-xl sm:text-2xl font-bold leading-snug tracking-tight text-foreground">
                    {lead.title}
                  </h3>
                  <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{lead.content}</p>
                  <p className="text-sm text-muted-foreground">
                    <Translated k="bulletins.postedBy" />{" "}
                    <strong className="text-foreground">{lead.authorName}</strong>
                  </p>
                </div>
              </article>

              {/* The rest as a rail: thumbnail left, copy right, hairlines instead of cards. */}
              {rest.length > 0 && (
                <div className="lg:border-l lg:border-border lg:pl-8">
                  {rest.map((bulletin) => {
                    const cat = presentBulletinCategory(bulletin.category);
                    return (
                      <article key={bulletin.id} className="flex gap-3.5 border-b border-border py-4 first:pt-0">
                        {bulletin.mediaType === "image" && bulletin.mediaUrl ? (
                          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                            <Image src={bulletin.mediaUrl} alt={bulletin.title} fill className="object-cover" sizes="80px" />
                          </div>
                        ) : (
                          <div className="size-16 shrink-0 rounded-xl border border-border bg-muted" />
                        )}
                        <div className="min-w-0 space-y-1">
                          <span className={`tone-chip px-2 py-0.5 ${cat.toneClass}`}>
                            <Translated k={cat.labelKey} />
                          </span>
                          <h4 className="font-heading text-sm font-bold leading-snug text-foreground">{bulletin.title}</h4>
                          <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-muted-foreground">
                            <Calendar className="size-3" />
                            {bulletin.publishedAt}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()
      ) : bulletins.length > 0 ? (
        <div
          className={`grid gap-6 ${
            compact ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 lg:grid-cols-2"
          } items-stretch`}
        >
          {bulletins.map((bulletin) => {
            const catInfo = presentBulletinCategory(bulletin.category);

            return (
              <article
                key={bulletin.id}
                className={`flex flex-col justify-between rounded-3xl border bg-card shadow-xs overflow-hidden transition-all ${
                  bulletin.isPinned
                    ? "border-foreground/60 bg-muted/20 shadow-xs"
                    : "border-border"
                }`}
              >
                <div>
                  {/*
                    Both URLs arrive filtered by `@/lib/domain/bulletinMedia`: the
                    repository drops any host outside the allow-list before this
                    component sees it, so an `<iframe src>` here can only ever
                    point at an embed host the shelter chose. A row inserted past
                    the server action — by the seed, or by the hand-run migration —
                    is filtered on exactly this path.
                  */}
                  {bulletin.mediaType === "video" && bulletin.videoEmbedUrl ? (
                    <div className="relative aspect-16/9 w-full bg-black">
                      <iframe
                        src={bulletin.videoEmbedUrl}
                        title={bulletin.title}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  ) : bulletin.mediaType === "image" && bulletin.mediaUrl ? (
                    <div className="relative aspect-16/9 w-full bg-muted overflow-hidden">
                      <Image
                        src={bulletin.mediaUrl}
                        alt={bulletin.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 500px"
                      />
                    </div>
                  ) : null}

                  <div className="p-6 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`tone-chip px-3 py-1 ${catInfo.toneClass}`}>
                          <Translated k={catInfo.labelKey} />
                        </span>

                        {bulletin.isPinned && (
                          <span className="tone-chip tone-warning px-3 py-1">
                            <Pin className="size-3" /> <Translated k="bulletins.pinned" />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground font-semibold">
                        <Calendar className="size-3.5" />
                        <span>{bulletin.publishedAt}</span>
                      </div>
                    </div>

                    <h3 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-snug">
                      {bulletin.title}
                    </h3>

                    <p className="text-sm sm:text-base text-foreground/90 leading-relaxed whitespace-pre-line">
                      {bulletin.content}
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-0 border-t border-border/40 mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    <Translated k="bulletins.postedBy" />{" "}
                    <strong className="text-foreground">{bulletin.authorName}</strong>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-border bg-muted/10 p-8 text-center space-y-3">
          {/*
            Worded to be true whatever emptied the list. It used to say nothing
            had been posted, which is false during a database outage — when the
            repository serves no notices rather than stale ones — and `/` and
            `/bulletins` cache this render for up to five minutes.
          */}
          <p className="text-sm text-muted-foreground">
            <Translated k="bulletins.noUpdates" />
          </p>
        </div>
      )}
    </section>
  );
}
