"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle } from "lucide-react";

import {
  bulletinFormSchema,
  BulletinFormInput,
  BULLETIN_CATEGORIES,
  BULLETIN_TARGET_PAGES,
  BULLETIN_MEDIA_TYPES,
} from "@/lib/validations/bulletin";
import {
  BULLETIN_CATEGORY_PRESENTATION,
  BULLETIN_TARGET_PAGE_LABELS,
} from "@/lib/presentation/bulletinPresentation";
import { BULLETIN_EMBED_HOSTS, BULLETIN_IMAGE_HOSTS } from "@/lib/domain/bulletinMedia";
import { BulletinRecord } from "@/types/bulletin";
import { shelterToday } from "@/lib/domain/bulletinSchedule";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface BulletinFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingBulletin?: BulletinRecord | null;
  /** Server-side save failure, rendered next to the submit button. */
  error?: string | null;
  onSave: (data: BulletinFormInput) => Promise<void> | void;
}

const MEDIA_TYPE_LABELS: Record<(typeof BULLETIN_MEDIA_TYPES)[number], string> = {
  none: "No media — text only",
  image: "Image",
  video: "Video embed",
};

/**
 * The default notice date: the SHELTER's today, not the browser's.
 *
 * The date decides when a notice goes live, and the server judges that against
 * `Asia/Kuala_Lumpur` (`@/lib/domain/bulletinSchedule`). A browser-local default
 * disagreed with it for anyone not in Malaysia: an editor in Tokyo or Sydney
 * posting an urgent notice between their midnight and Malaysia's got Malaysia's
 * *tomorrow* as the default, and the notice stayed off every public feed for
 * hours. UTC was wrong the other way, by eight hours, for everyone in Malaysia.
 * Using the server's own rule — `shelterToday` — is the only default that cannot
 * disagree with it.
 */

const EMPTY: BulletinFormInput = {
  category: "announcement",
  targetPage: "all",
  title: "",
  content: "",
  titleMs: "",
  contentMs: "",
  mediaType: "none",
  mediaUrl: "",
  videoEmbedUrl: "",
  isPinned: false,
  isPublished: true,
  publishedAt: shelterToday(),
};

const selectClass =
  "w-full bg-background border border-input px-3.5 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-foreground";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

/**
 * The stored value of an enum field that this build's option list does not
 * carry, or `null`.
 *
 * **Typed against `string` on purpose.** Prisma types these columns as its
 * generated enums, which is optimistic: the hand-run migration writes the
 * column directly, and a rolling deploy can leave an older bundle reading a
 * value a newer one wrote. An earlier revision narrowed `BulletinCategory`
 * with a `value is BulletinCategory` predicate, which made the unknown branch
 * `never` — the compiler believed it unreachable, so inverting the test or
 * deleting the option typechecked identically and nothing was protected.
 *
 * What surfacing the value buys is a readable message, and only that. It is
 * **not** an integrity guard: `useForm` runs `zodResolver(bulletinFormSchema)`
 * and each field is a `z.enum`, so an unrecognised value fails validation and
 * `onSave` is never reached either way. Without the option the browser sets
 * `selectedIndex = -1`, so the editor sees a blank control and a raw
 * `Invalid enum value`; with it they see what the row holds and why it cannot
 * be saved. Do not read this as the thing stopping a bad write — the `z.enum`
 * is, and removing that on the strength of this comment is the mistake
 * `tasks/lessons/2026-09-22-fixing-one-readers-policy-turns-its-neighbours-comments-into-the-spec.md`
 * describes.
 */
function unrecognisedValue(
  stored: string | undefined,
  known: readonly string[]
): string | null {
  if (stored === undefined) return null;
  return known.includes(stored) ? null : stored;
}

/** The option shown for a stored value this build cannot offer. */
function UnrecognisedOption({ value }: { value: string }) {
  return <option value={value}>{value} — not recognised by this version</option>;
}

/** The note beneath such a select, naming the field. */
function UnrecognisedNote({ field }: { field: string }) {
  return (
    <p className="text-xs text-muted-foreground mt-1">
      This notice&apos;s {field} is a value this version does not know. Choose one
      above to save — the stored value cannot be kept.
    </p>
  );
}

/**
 * Create/edit form for a community bulletin.
 *
 * Note what the form does NOT offer: a byline field. The author is taken from
 * the verified session by `createBulletinAction`, so one editor cannot publish
 * under another's name. An edit leaves the original byline alone.
 *
 * The media URL fields name their allowed hosts inline rather than only failing
 * validation, because the allow-list is not guessable — an editor pasting a
 * perfectly valid Imgur link has no way to know this site cannot render it.
 */
export function BulletinFormDialog({
  open,
  onOpenChange,
  editingBulletin,
  error,
  onSave,
}: BulletinFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BulletinFormInput>({
    resolver: zodResolver(bulletinFormSchema),
    defaultValues: EMPTY,
  });

  // Reset whenever the dialog opens on a different record, mirroring the
  // render-phase key comparison used by FaqFormDialog and PetFormDialog.
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const currentKey = open
    ? editingBulletin
      ? `edit-${editingBulletin.id}`
      : "create-new"
    : null;

  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    if (editingBulletin) {
      reset({
        category: editingBulletin.category,
        targetPage: editingBulletin.targetPage,
        title: editingBulletin.title,
        content: editingBulletin.content,
        // The unresolved values: the editor must not present the English
        // fallback as if it were a translation, or saving would freeze it into
        // the Malay column.
        titleMs: editingBulletin.titleMs ?? "",
        contentMs: editingBulletin.contentMs ?? "",
        mediaType: editingBulletin.mediaType,
        mediaUrl: editingBulletin.mediaUrl ?? "",
        videoEmbedUrl: editingBulletin.videoEmbedUrl ?? "",
        isPinned: editingBulletin.isPinned,
        isPublished: editingBulletin.isPublished,
        publishedAt: editingBulletin.publishedAt,
      });
    } else if (open) {
      reset({ ...EMPTY, publishedAt: shelterToday() });
    }
  }

  const mediaType = watch("mediaType");

  // All three enum selects, not just `category`: they have the same shape, the
  // same reachability and the same failure. See `unrecognisedValue`.
  const unknownCategory = unrecognisedValue(editingBulletin?.category, BULLETIN_CATEGORIES);
  const unknownTargetPage = unrecognisedValue(
    editingBulletin?.targetPage,
    BULLETIN_TARGET_PAGES
  );
  const unknownMediaType = unrecognisedValue(editingBulletin?.mediaType, BULLETIN_MEDIA_TYPES);

  const submit = handleSubmit(async (values) => {
    await onSave(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingBulletin ? "Edit Bulletin" : "Post a New Bulletin"}
          </DialogTitle>
          <DialogDescription>
            Published notices appear immediately on the public feeds. The byline is
            your own name and is not editable. The Bahasa Malaysia fields are stored
            but not yet rendered — the public feed is English-only for now.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="bulletin-category">Category</Label>
              <select
                id="bulletin-category"
                {...register("category")}
                className={selectClass}
              >
                {unknownCategory && <UnrecognisedOption value={unknownCategory} />}
                {BULLETIN_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {BULLETIN_CATEGORY_PRESENTATION[value].label}
                  </option>
                ))}
              </select>
              {unknownCategory && <UnrecognisedNote field="category" />}
              <FieldError message={errors.category?.message} />
            </div>

            <div>
              <Label htmlFor="bulletin-target">Show on</Label>
              <select
                id="bulletin-target"
                {...register("targetPage")}
                className={selectClass}
              >
                {unknownTargetPage && <UnrecognisedOption value={unknownTargetPage} />}
                {BULLETIN_TARGET_PAGES.map((value) => (
                  <option key={value} value={value}>
                    {BULLETIN_TARGET_PAGE_LABELS[value]}
                  </option>
                ))}
              </select>
              {unknownTargetPage && <UnrecognisedNote field="target page" />}
              <FieldError message={errors.targetPage?.message} />
            </div>

            <div>
              <Label htmlFor="bulletin-date">Notice date</Label>
              <Input id="bulletin-date" type="date" {...register("publishedAt")} />
              <p className="text-xs text-muted-foreground mt-1">
                A future date schedules the notice: it stays off the public feeds
                until that day.
              </p>
              <FieldError message={errors.publishedAt?.message} />
            </div>
          </div>

          <div>
            <Label htmlFor="bulletin-title">Title (English)</Label>
            <Input
              id="bulletin-title"
              placeholder="Low-cost microchip &amp; vaccination clinic this Saturday"
              {...register("title")}
            />
            <FieldError message={errors.title?.message} />
          </div>

          <div>
            <Label htmlFor="bulletin-content">Content (English)</Label>
            <Textarea
              id="bulletin-content"
              rows={6}
              placeholder="Leave a blank line between paragraphs to break the notice up."
              {...register("content")}
            />
            <FieldError message={errors.content?.message} />
          </div>

          <div className="border-t border-border pt-5 space-y-4">
            <div>
              <Label htmlFor="bulletin-media-type">Media</Label>
              <select
                id="bulletin-media-type"
                {...register("mediaType")}
                className={selectClass}
              >
                {unknownMediaType && <UnrecognisedOption value={unknownMediaType} />}
                {BULLETIN_MEDIA_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {MEDIA_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
              {unknownMediaType && (
                <>
                  <UnrecognisedNote field="media type" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Its stored media URLs stay hidden while the type is
                    unrecognised, and the one that does not match the type you
                    choose is cleared on save.
                  </p>
                </>
              )}
              <FieldError message={errors.mediaType?.message} />
            </div>

            {mediaType === "image" && (
              <div>
                <Label htmlFor="bulletin-media-url">Image URL</Label>
                <Input
                  id="bulletin-media-url"
                  placeholder="https://images.unsplash.com/photo-..."
                  {...register("mediaUrl")}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Allowed hosts: {BULLETIN_IMAGE_HOSTS.join(", ")}. An image
                  elsewhere will not render.
                </p>
                <FieldError message={errors.mediaUrl?.message} />
              </div>
            )}

            {mediaType === "video" && (
              <div>
                <Label htmlFor="bulletin-embed-url">Video embed URL</Label>
                <Input
                  id="bulletin-embed-url"
                  placeholder="https://www.youtube-nocookie.com/embed/..."
                  {...register("videoEmbedUrl")}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Allowed hosts: {BULLETIN_EMBED_HOSTS.join(", ")}. Use the
                  <strong> embed </strong> link, not the page link.
                </p>
                <FieldError message={errors.videoEmbedUrl?.message} />
              </div>
            )}
          </div>

          <div className="border-t border-border pt-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bahasa Malaysia (optional, not yet rendered)
            </p>

            <div>
              <Label htmlFor="bulletin-title-ms">Tajuk</Label>
              <Input id="bulletin-title-ms" {...register("titleMs")} />
              <FieldError message={errors.titleMs?.message} />
            </div>

            <div>
              <Label htmlFor="bulletin-content-ms">Kandungan</Label>
              <Textarea id="bulletin-content-ms" rows={5} {...register("contentMs")} />
              <FieldError message={errors.contentMs?.message} />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                {...register("isPublished")}
                className="size-4 accent-foreground"
              />
              Published — visible on the public feeds
            </label>

            <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                {...register("isPinned")}
                className="size-4 accent-foreground"
              />
              Pinned — sorted above unpinned notices
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 border border-destructive/40 bg-destructive/10 px-4 py-3 rounded-xl text-sm text-destructive"
            >
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editingBulletin ? "Save Changes" : "Publish Bulletin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
