import React from "react";
import Image from "next/image";
import { Pin, Calendar } from "lucide-react";

import { Bulletin } from "@/types/bulletin";
import { presentBulletinCategory } from "@/lib/presentation/bulletinPresentation";

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
  title?: string;
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
 */
export function BulletinFeed({
  bulletins,
  title = "Shelter Bulletins & Updates",
  compact = false,
}: BulletinFeedProps) {
  return (
    <section className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 mb-6">
        <div>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h2>
        </div>
      </div>

      {bulletins.length > 0 ? (
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
                className={`flex flex-col justify-between border bg-card overflow-hidden transition-all ${
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
                          {catInfo.label}
                        </span>

                        {bulletin.isPinned && (
                          <span className="tone-chip tone-warning px-3 py-1">
                            <Pin className="size-3" /> Pinned
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
                    Posted by:{" "}
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
          <p className="text-sm text-muted-foreground">No updates to show right now.</p>
        </div>
      )}
    </section>
  );
}
