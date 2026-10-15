"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Loader2,
  AlertCircle,
} from "lucide-react";

import { BulletinFormDialog } from "@/components/admin/BulletinFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createBulletinAction,
  deleteBulletinAction,
  setBulletinPinnedAction,
  setBulletinPublishedAction,
  updateBulletinAction,
} from "@/actions/bulletins";
import {
  BULLETIN_CATEGORY_PRESENTATION,
  BULLETIN_TARGET_PAGE_LABELS,
  normaliseBulletinCategory,
  presentBulletinCategory,
} from "@/lib/presentation/bulletinPresentation";
import { BULLETIN_CATEGORIES, BulletinFormInput } from "@/lib/validations/bulletin";
import { BulletinRecord } from "@/types/bulletin";
import { isScheduledForLater, shelterToday } from "@/lib/domain/bulletinSchedule";
import { cn } from "@/lib/utils";

type CategoryFilter = (typeof BULLETIN_CATEGORIES)[number] | "all";
type PublishedFilter = "all" | "published" | "draft";

const selectClass =
  "bg-background border border-input px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-foreground";

/**
 * Shown when a server action fails before it returns its own result.
 *
 * It must not claim nothing was saved: the request may have reached the server
 * and committed before the response was lost (a dropped connection, a function
 * timeout, a failed refresh payload). An editor told "nothing was saved" clicks
 * Save again and posts the notice twice. Telling them to reload and look first
 * is the only advice that is right in both cases.
 */
const UNREACHABLE_MESSAGE =
  "The server did not respond, so this change may or may not have been saved. " +
  "Reload the page and check before trying again — if the site was just updated, " +
  "the reload is also what fixes it.";

/** Matches a record against the toolbar query, across both languages. */
function matches(bulletin: BulletinRecord, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const haystack = [
    bulletin.title,
    bulletin.content,
    bulletin.titleMs,
    bulletin.contentMs,
    bulletin.authorName,
  ]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.some((text) => text.includes(term)));
}

interface BulletinDataTableProps {
  initialBulletins: BulletinRecord[];
}

/**
 * The staff bulletin editor.
 *
 * Replaces the "Staff Admin Access" toggle that used to sit on three public
 * pages and write to the visitor's own localStorage. Everything here goes
 * through `src/actions/bulletins.ts`, which re-checks `MANAGE_CONTENT` on the
 * server: the page-level guard controls what is rendered, not what is
 * permitted.
 *
 * Rows arrive from the page's Server Component and refresh through
 * `router.refresh()` after each write, matching `FaqDataTable`. There is no
 * client-side optimistic copy, so the table cannot disagree with the database
 * about what is published — which is precisely the failure the old store had.
 */
export function BulletinDataTable({ initialBulletins }: BulletinDataTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [published, setPublished] = useState<PublishedFilter>("all");

  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<BulletinRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BulletinRecord | null>(null);

  const bulletins = initialBulletins;

  /**
   * Runs a server action, surfaces its error, and refreshes the table data.
   *
   * The `catch` is for failures that never reach the action's own result: the
   * editor is offline, or a redeploy invalidated the action id ("Failed to find
   * Server Action"). In React 19 an error thrown inside a transition goes to the
   * nearest error boundary, so without this one failed Pin click replaced the
   * whole editor with an error page instead of a line in the banner.
   */
  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setError(result.error ?? "The operation failed.");
          return;
        }
        router.refresh();
      } catch (err) {
        // Logged, so a stale action id after a deploy can be told apart from
        // being offline or from a client bug.
        console.error("[bulletins] server action failed before returning a result", err);
        setError(UNREACHABLE_MESSAGE);
      }
    });
  }

  const filtered = useMemo(
    () =>
      bulletins.filter((b) => {
        // Compare the presented category, not the raw slug. A row whose
        // category this build does not carry badges as "Notice" via the
        // presenter, and comparing raw would then hide it when the editor
        // filtered for Notice — the row the badge had just called one.
        if (category !== "all" && normaliseBulletinCategory(b.category) !== category)
          return false;
        if (published === "published" && !b.isPublished) return false;
        if (published === "draft" && b.isPublished) return false;
        return matches(b, search);
      }),
    [bulletins, category, published, search]
  );

  // One "today" for the whole render, shared by the count and every row's badge,
  // so the two cannot disagree across the shelter's midnight.
  // ceiling: computed per render, so a server render and its hydration that
  // straddle midnight disagree (a React hydration warning), and an idle tab keeps
  // last night's badges until anything re-renders it. Admin-only and cosmetic —
  // what the public sees is the server's query. Tick it on a timer if staff ever
  // rely on the badge at midnight.
  const today = shelterToday();
  const publishedCount = bulletins.filter((b) => b.isPublished).length;
  // Published but dated in the future: on no public feed yet. Counted apart so
  // "published" in the summary line means what a visitor can actually see.
  const scheduledCount = bulletins.filter(
    (b) => b.isPublished && isScheduledForLater(b.publishedAt, today)
  ).length;

  function handleOpenCreate() {
    setEditing(null);
    setSaveError(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(bulletin: BulletinRecord) {
    setEditing(bulletin);
    setSaveError(null);
    setIsFormOpen(true);
  }

  /**
   * Saves from the dialog are awaited here rather than routed through `run`,
   * and their error goes to a separate state: the main banner sits behind the
   * still-open modal, where an editor would never see it.
   */
  async function handleSave(values: BulletinFormInput) {
    setSaveError(null);
    let result: { success: boolean; error?: string };
    try {
      result = editing
        ? await updateBulletinAction(editing.id, values)
        : await createBulletinAction(values);
    } catch (err) {
      console.error("[bulletins] save failed before returning a result", err);
      // Same transport-level failure as `run`. Here it would otherwise be an
      // unhandled rejection that left the dialog open with no message at all.
      setSaveError(UNREACHABLE_MESSAGE);
      return;
    }

    if (!result.success) {
      setSaveError(result.error ?? "The bulletin could not be saved.");
      return;
    }

    setIsFormOpen(false);
    setEditing(null);
    router.refresh();
  }

  function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    run(() => deleteBulletinAction(target.id));
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex items-center border-b border-input focus-within:border-b-ring transition-colors sm:max-w-xs flex-1">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notices…"
              className="pl-3 border-b-transparent focus-visible:border-b-transparent"
              aria-label="Search bulletins"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
            className={selectClass}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {BULLETIN_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {BULLETIN_CATEGORY_PRESENTATION[value].label}
              </option>
            ))}
          </select>

          <select
            value={published}
            onChange={(e) => setPublished(e.target.value as PublishedFilter)}
            className={selectClass}
            aria-label="Filter by publication status"
          >
            <option value="all">Published &amp; drafts</option>
            <option value="published">Published only</option>
            <option value="draft">Drafts only</option>
          </select>
        </div>

        <Button onClick={handleOpenCreate} className="shrink-0">
          <Plus className="size-4" />
          Post Bulletin
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {bulletins.length} total · {publishedCount - scheduledCount} live ·{" "}
        {scheduledCount} scheduled · {bulletins.length - publishedCount} draft
        {filtered.length !== bulletins.length && ` · ${filtered.length} matching filters`}
      </p>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border border-destructive/40 bg-destructive/10 px-4 py-3 rounded-xl text-sm text-destructive"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-border rounded-2xl bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {bulletins.length === 0
              ? "No bulletins yet. A notice dated today goes on the public feeds as soon as you publish it; a later date schedules it."
              : "No bulletins match the current filters."}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "border border-border rounded-xl overflow-hidden bg-background divide-y divide-border",
            isPending && "opacity-60 pointer-events-none"
          )}
        >
          {filtered.map((bulletin) => {
            // Through the presenter, not the table: a row whose category this
            // build does not carry — written by the hand-run migration, or by a
            // newer deploy — would otherwise be `undefined` here and throw on
            // `.toneClass`, taking down the one screen where that row could be
            // repaired. The public feed already reads it this way.
            const catInfo = presentBulletinCategory(bulletin.category);

            return (
              <div
                key={bulletin.id}
                className="flex flex-col sm:flex-row sm:items-start gap-3 px-4 py-3.5"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`tone-chip px-2.5 py-0.5 ${catInfo.toneClass}`}>
                      {catInfo.label}
                    </span>
                    {bulletin.isPinned && (
                      <span className="tone-chip tone-warning px-2.5 py-0.5">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                    {!bulletin.isPublished && (
                      <span className="tone-chip tone-neutral px-2.5 py-0.5">Draft</span>
                    )}
                    {bulletin.isPublished && isScheduledForLater(bulletin.publishedAt, today) && (
                      // A published notice with a future date is not on any
                      // public feed yet. Without this badge the editor sees
                      // "published" and a row that appears nowhere.
                      <span
                        className="tone-chip tone-info px-2.5 py-0.5"
                        title="Published, but dated in the future: it appears on the public feeds on that day (shelter time)."
                      >
                        Scheduled
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {bulletin.publishedAt}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {BULLETIN_TARGET_PAGE_LABELS[bulletin.targetPage] ?? bulletin.targetPage}
                    </span>
                  </div>

                  <p className="font-semibold text-sm text-foreground truncate">
                    {bulletin.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {bulletin.content}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Posted by {bulletin.authorName}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      run(() => setBulletinPinnedAction(bulletin.id, !bulletin.isPinned))
                    }
                    title={bulletin.isPinned ? "Unpin notice" : "Pin notice to top"}
                    aria-label={bulletin.isPinned ? "Unpin notice" : "Pin notice to top"}
                  >
                    {bulletin.isPinned ? (
                      <PinOff className="size-3.5" />
                    ) : (
                      <Pin className="size-3.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      run(() =>
                        setBulletinPublishedAction(bulletin.id, !bulletin.isPublished)
                      )
                    }
                    title={bulletin.isPublished ? "Unpublish" : "Publish"}
                    aria-label={bulletin.isPublished ? "Unpublish notice" : "Publish notice"}
                  >
                    {bulletin.isPublished ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleOpenEdit(bulletin)}
                    title="Edit bulletin"
                    aria-label="Edit bulletin"
                  >
                    <Edit2 className="size-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setPendingDelete(bulletin)}
                    title="Delete bulletin"
                    aria-label="Delete bulletin"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isPending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Saving…
        </p>
      )}

      <BulletinFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editingBulletin={editing}
        error={saveError}
        onSave={handleSave}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this bulletin?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title}” will be removed from every public feed. This
              cannot be undone — unpublish instead if you only want to hide it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
