import type {
  Bulletin as DbBulletinRow,
  BulletinCategory as PrismaBulletinCategory,
  BulletinTargetPage as PrismaBulletinTargetPage,
  BulletinMediaType as PrismaBulletinMediaType,
} from "@prisma/client";

import initialBulletinsData from "@/data/bulletins.json";
import {
  Bulletin,
  BulletinCategory,
  BulletinMediaType,
  BulletinRecord,
  BulletinTargetPage,
} from "@/types/bulletin";
import {
  BULLETIN_CATEGORIES,
  BULLETIN_MEDIA_TYPES,
  BULLETIN_TARGET_PAGES,
  BulletinFormValues,
} from "@/lib/validations/bulletin";
import { toPublicEmbedUrl, toPublicMediaUrl } from "@/lib/domain/bulletinMedia";
import {
  BULLETIN_FEED_ORDER_BY,
  sortBulletinsForFeed,
} from "@/lib/domain/bulletinOrdering";
import {
  isScheduledForLater,
  shelterTodayAsStoredInstant,
} from "@/lib/domain/bulletinSchedule";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { SessionUser } from "@/lib/security/session";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError } from "@/lib/persistenceMode";

/**
 * Bulletin reads and writes over the repository layer.
 *
 * Storage strategy matches `./faqRepository`: Prisma when a database is
 * reachable, the committed `src/data/bulletins.json` fixture when it is not, so
 * the public feed still renders during an outage and the unit suite needs no
 * database. As with FAQ — and unlike the older pet path — an *empty* result is
 * not treated as an outage; see `getPublicBulletins`.
 *
 * This module is the only bulletin code permitted to touch Prisma
 * (docs/architecture/LAYERS.md, L-B2); `src/actions/bulletins.ts` calls in here.
 *
 * It replaces `src/lib/client/bulletinStore.ts`, an L-F4 localStorage hook that
 * was the entire persistence story for this type: every visitor edited their own
 * private copy, nothing staff wrote reached anyone, and a redeployed fixture
 * never reached a browser that had already stored one.
 */

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time proof that the declarations of each bulletin vocabulary agree:
 * the Prisma enums, the TypeScript unions, and the zod tuples. The presentation
 * tables in `@/lib/presentation/bulletinPresentation` are `Record<…, …>` over
 * the same unions, so the compiler already holds them to this without needing a
 * reference here.
 *
 * Adding a category to the schema without adding it to the union — or the
 * reverse — makes this line a type error rather than a value that reaches
 * production and renders as its own raw slug.
 */
export const BULLETIN_VOCABULARY_IS_CONSISTENT: Exact<
  PrismaBulletinCategory,
  BulletinCategory
> &
  Exact<(typeof BULLETIN_CATEGORIES)[number], BulletinCategory> &
  Exact<PrismaBulletinTargetPage, BulletinTargetPage> &
  Exact<(typeof BULLETIN_TARGET_PAGES)[number], BulletinTargetPage> &
  Exact<PrismaBulletinMediaType, BulletinMediaType> &
  Exact<(typeof BULLETIN_MEDIA_TYPES)[number], BulletinMediaType> = true;

/** The fixture, typed. Its shape is asserted by tests/unit/bulletins.test.ts. */
interface BulletinFixtureRow {
  id: string;
  title: string;
  content: string;
  titleMs: string | null;
  contentMs: string | null;
  category: BulletinCategory;
  targetPage: BulletinTargetPage;
  mediaType: BulletinMediaType;
  mediaUrl: string | null;
  videoEmbedUrl: string | null;
  isPinned: boolean;
  isPublished: boolean;
  authorName: string;
  publishedAt: string;
}

function freshBulletins(): BulletinRecord[] {
  /**
   * Fixture timestamps are derived from the notice date, not from a shared
   * constant.
   *
   * Two earlier revisions got this wrong in opposite directions. One truncated
   * `createdAt` to `YYYY-MM-DD`; the next restored the full instant but still
   * stamped every row with the same epoch. Both left the `createdAt` tiebreaker
   * dead on this path — every row compared equal, so a tied `publishedAt` fell
   * through to `id`, while the database broke the same tie on a real
   * `TIMESTAMP(3)`. Two notices on one day could therefore order one way on the
   * query path and the other way during an outage.
   *
   * The fixture has no real creation instant to carry: these rows are
   * deploy-time content. Midnight UTC on the notice date is the honest stand-in
   * — it is distinct wherever `publishedAt` is distinct, and it orders
   * identically to it, so the rule produces a consistent answer on both paths.
   * Where two fixture rows do share a day the tie falls to `id`, which is the
   * best available and matches what the query does when its timestamps also tie.
   */
  return (structuredClone(initialBulletinsData) as BulletinFixtureRow[]).map((row) => {
    const instant = `${row.publishedAt}T00:00:00.000Z`;
    return { ...row, createdAt: instant, updatedAt: instant };
  });
}

let serverBulletins: BulletinRecord[] = freshBulletins();

/** Test-only. Reached through `resetServerStore()` in `./fallbackState`. */
export function resetBulletins(): void {
  serverBulletins = freshBulletins();
}

/**
 * `DbBulletinRow` is Prisma's generated `Bulletin` type, imported above — not a
 * hand-copied interface. An earlier revision kept its own copy and cast every
 * query result through `as unknown as`, which switched off the one check that
 * matters here: a renamed or retyped column would have typechecked and then
 * mapped to `undefined` on every card and every audit entry.
 */

/**
 * Prisma's "record to update/delete does not exist". Reached when a row is
 * deleted between an editor opening it and acting on it; mapped to the action's
 * not-found answer rather than reported as a generic failure.
 */
function isRecordMissing(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2025"
  );
}

/**
 * True when the `bulletins` table (P2021) or one of its columns (P2022) does not
 * exist — the state of any database the hand-run migration has not reached.
 *
 * Exported because the action layer needs the same answer to tell an editor
 * *why* nothing saves: `isDatabaseUnavailable` covers connectivity, not a
 * schema that was never applied.
 */
export function isBulletinSchemaMissing(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

/**
 * Whether a failed public read may fall back to the committed fixture.
 *
 * - **Outside production**: yes. The fixture is the offline dataset that local
 *   development without a database, and the unit suite, run on.
 * - **In production, table missing (P2021)**: yes. That is a deploy that landed
 *   before the migration, and the fixture is precisely the launch content the
 *   migration would seed — what visitors saw before this feature existed.
 * - **In production, anything else**: no. Once the table exists, staff own its
 *   contents. Serving the fixture on a transient failure would bring back
 *   notices staff have deleted or unpublished and hide everything they posted,
 *   and `/` and `/bulletins` are ISR, so that render would be cached as the good
 *   page for up to five minutes. An empty feed asserts nothing false; the
 *   fixture would.
 */
function mayServeFixtureAfter(err: unknown): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  // P2021 only. A missing *column* (P2022) means a table that exists and holds
  // staff content under a drifted schema — the fixture would hide that content.
  return (
    typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2021"
  );
}

/**
 * A NOTICE DATE is a day, not an instant — this is for `publishedAt` only.
 *
 * Read back in UTC so the string an editor typed is the string every reader
 * sees. Formatting in local time would move a clinic announced for Saturday
 * onto Friday for anyone west of the shelter, which is the whole content of the
 * notice.
 *
 * `createdAt` and `updatedAt` are deliberately NOT put through this. They are
 * instants, and truncating them to a day discards the ordering the feed's
 * tiebreaker depends on: two notices written at 09:00 and 14:00 on one day tie
 * in memory and do not tie in the query.
 */
function toDateString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/** Full ISO instant, for the timestamp columns. */
function toInstant(value: Date | string): string {
  return (typeof value === "string" ? new Date(value) : value).toISOString();
}

/** Local to this module: the write path is the only thing that needs it. */
function parseNoticeDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function mapDbBulletin(row: DbBulletinRow): BulletinRecord {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    titleMs: row.titleMs,
    contentMs: row.contentMs,
    category: row.category,
    targetPage: row.targetPage,
    mediaType: row.mediaType,
    mediaUrl: row.mediaUrl,
    videoEmbedUrl: row.videoEmbedUrl,
    isPinned: row.isPinned,
    isPublished: row.isPublished,
    authorName: row.authorName,
    publishedAt: toDateString(row.publishedAt),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  };
}

/**
 * The public projection.
 *
 * Both media URLs pass the host allow-list here — the enforcing half of that
 * check, because the seed and the hand-run migration insert rows without going
 * near the action that validates on write.
 *
 * **There is no Malay resolution in this function, and `Bulletin` carries no
 * Malay fields.** `titleMs`/`contentMs` are stored and editable but not yet
 * read by anything; the public feed is English-only until
 * `tasks/open/home-page-text-stays-english-on-the-malay-site.md` is settled.
 * Whoever settles it adds the fields to `Bulletin` **and** the
 * `titleMs ?? title` fallback here at the same time — `Faq`'s `toFaqItem` is
 * the shape to copy. Adding the field without the fallback ships a blank Malay
 * title for every row that has no translation, which today is all of them.
 */
function toBulletin(record: BulletinRecord): Bulletin {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    category: record.category,
    targetPage: record.targetPage,
    mediaType: record.mediaType,
    mediaUrl: toPublicMediaUrl(record.mediaUrl),
    videoEmbedUrl: toPublicEmbedUrl(record.videoEmbedUrl),
    isPinned: record.isPinned,
    publishedAt: record.publishedAt,
    authorName: record.authorName,
  };
}

function matchesTarget(record: { targetPage: BulletinTargetPage }, page: BulletinTargetPage) {
  if (page === "all") return true;
  return record.targetPage === "all" || record.targetPage === page;
}

/**
 * Published bulletins for one public feed.
 *
 * A successful query returning no rows is an ANSWER — staff have unpublished
 * everything, or nothing targets this page — not an outage. Substituting the
 * fixture there would resurrect retracted notices and leave no way to empty the
 * feed, so only a thrown error falls back. This is the settled repo-wide
 * position; `tests/integration/faqEmptyPublishSet.test.ts` pins it for FAQ and
 * `getServerPetsAsync` was brought onto it afterwards.
 *
 * `limit` is pushed into the query rather than sliced afterwards: the ordering
 * is the database's, so `take` returns the notices a page would have shown
 * without reading the rest. The fixture path below has to sort in memory
 * instead, through `sortBulletinsForFeed` in `@/lib/domain/bulletinOrdering`,
 * which shares `BULLETIN_FEED_ORDER_BY` with the query so the two cannot
 * answer differently.
 *
 * ceiling: an unlimited call (`/bulletins`) reads every published row in one
 * payload. Fine at shelter scale — tens of notices — but page it if the archive
 * outgrows a few hundred, which is also when the feed stops being readable.
 */
export async function getPublicBulletins(
  targetPage: BulletinTargetPage = "all",
  limit?: number
): Promise<Bulletin[]> {
  try {
    const rows = await prisma.bulletin.findMany({
      where: {
        isPublished: true,
        // A future notice date schedules the notice; see
        // `@/lib/domain/bulletinSchedule` for why "today" is the shelter's day.
        publishedAt: { lte: shelterTodayAsStoredInstant() },
        targetPage:
          targetPage === "all"
            ? undefined
            : { in: ["all", targetPage] as PrismaBulletinTargetPage[] },
      },
      // One declaration, shared with the in-memory path below, so the two
      // cannot drift apart and have an outage silently reorder the feed.
      orderBy: [...BULLETIN_FEED_ORDER_BY],
      // `limit !== undefined`, not `limit ?`: a caller computing the count can
      // legitimately pass 0, and `limit ?` would read that as "no limit" and
      // render the entire published archive.
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map(mapDbBulletin).map(toBulletin);
  } catch (err) {
    // Rethrows in strict mode and on unique violations; otherwise returns.
    handlePersistenceError("Bulletin read", err);
    if (!mayServeFixtureAfter(err)) {
      // `handlePersistenceError` logs only in development, so without this a
      // production outage would empty the feed with no trace anywhere.
      console.error(
        "[bulletins] public read failed; serving no notices rather than the launch fixture",
        err
      );
      return [];
    }
  }

  // Slice before projecting: `toBulletin` runs the URL allow-list, which builds
  // a `URL` per field, and there is no reason to do that for rows about to be
  // discarded. The query path already gets this right by pushing `take` down.
  const ordered = sortBulletinsForFeed(
    serverBulletins.filter(
      (b) =>
        b.isPublished && !isScheduledForLater(b.publishedAt) && matchesTarget(b, targetPage)
    )
  );
  const limited = limit !== undefined ? ordered.slice(0, limit) : ordered;
  return limited.map(toBulletin);
}

/**
 * Every row, published or not, for the editor.
 *
 * No fixture fallback, deliberately: those rows carry ids that need not exist in
 * the database, so every Edit, Delete and Pin on them would fail with "not
 * found" while the table insisted the data was there. An outage has to surface.
 * Copied from `listFaqRecords`, which learned it first.
 */
export async function listBulletinRecords(): Promise<BulletinRecord[]> {
  const rows = await prisma.bulletin.findMany({
    // Same ordering as the public read, so the editor sees notices in the
    // order visitors do rather than an order that shifts between page loads.
    orderBy: [...BULLETIN_FEED_ORDER_BY],
  });
  return rows.map(mapDbBulletin);
}

/**
 * The fields an editor controls, shared by create and update.
 *
 * `authorName` is deliberately NOT here: a create takes it from the acting
 * session, an update must leave it alone, and neither may take it from the
 * form. Keeping it out of the shared shape means a future field cannot pick up
 * the byline by accident.
 */
/**
 * Every field an editor can change, as the audit log should see it.
 *
 * Earlier revisions logged only title, category and target page on an edit, and
 * a partial notice on a delete while claiming in a comment to record "the whole
 * notice". So unticking Published in the edit form, rewriting the body, or
 * swapping the embedded video left no trace, and a deleted notice's Malay copy
 * and media were gone for good.
 */
function auditableState(record: BulletinRecord) {
  return {
    category: record.category,
    targetPage: record.targetPage,
    title: record.title,
    content: record.content,
    titleMs: record.titleMs,
    contentMs: record.contentMs,
    mediaType: record.mediaType,
    mediaUrl: record.mediaUrl,
    videoEmbedUrl: record.videoEmbedUrl,
    isPinned: record.isPinned,
    isPublished: record.isPublished,
    publishedAt: record.publishedAt,
    authorName: record.authorName,
  };
}

function editablePayload(values: BulletinFormValues) {
  return {
    category: values.category as PrismaBulletinCategory,
    targetPage: values.targetPage as PrismaBulletinTargetPage,
    title: values.title,
    content: values.content,
    titleMs: values.titleMs ?? null,
    contentMs: values.contentMs ?? null,
    mediaType: values.mediaType as PrismaBulletinMediaType,
    // A URL is kept only when its media type will actually render it, so
    // switching a card to None does not leave an orphaned iframe URL in the row
    // for a later edit to resurrect.
    mediaUrl: values.mediaType === "image" ? (values.mediaUrl ?? null) : null,
    videoEmbedUrl: values.mediaType === "video" ? (values.videoEmbedUrl ?? null) : null,
    isPinned: values.isPinned,
    isPublished: values.isPublished,
    publishedAt: parseNoticeDate(values.publishedAt),
  };
}

export async function insertServerBulletin(
  values: BulletinFormValues,
  actor: SessionUser
): Promise<BulletinRecord> {
  // The byline is the actor's, never the form's. See bulletinFormSchema.
  //
  // It falls back to the shelter, not to `actor.email`: the byline is rendered
  // on three public, cached, crawlable pages, and an address there is an
  // address published. A member without a display name is an edge case the
  // byline should survive quietly, not one that leaks.
  const created = await prisma.bulletin.create({
    data: { ...editablePayload(values), authorName: actor.name?.trim() || "Shelter Team" },
  });
  const record = mapDbBulletin(created);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "BULLETIN_CREATED",
    entity: "Bulletin",
    entityId: record.id,
    details: {
      category: record.category,
      targetPage: record.targetPage,
      title: record.title,
      isPublished: record.isPublished,
      isPinned: record.isPinned,
    },
  });

  return record;
}

export async function updateServerBulletin(
  id: string,
  values: BulletinFormValues,
  actor: SessionUser
): Promise<BulletinRecord | null> {
  const existing = await prisma.bulletin.findUnique({ where: { id } });
  if (!existing) return null;

  const before = mapDbBulletin(existing);
  // `authorName` is omitted: an edit does not reassign the byline, so correcting
  // a colleague's typo does not silently put your name on their notice.
  let updated: DbBulletinRow;
  try {
    updated = await prisma.bulletin.update({ where: { id }, data: editablePayload(values) });
  } catch (err) {
    // Deleted by someone else between the read above and this write.
    if (isRecordMissing(err)) return null;
    throw err;
  }
  const record = mapDbBulletin(updated);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "BULLETIN_UPDATED",
    entity: "Bulletin",
    entityId: id,
    // `before` matters as much as `after`: it is the only copy of what an edit
    // overwrote.
    details: { before: auditableState(before), after: auditableState(record) },
  });

  return record;
}

export async function setServerBulletinPublished(
  id: string,
  isPublished: boolean,
  actor: SessionUser
): Promise<BulletinRecord | null> {
  // One round trip. A separate existence read first was a check-then-act race:
  // a row deleted between the two surfaced as a generic failure and a logged
  // stack instead of the not-found answer.
  let updated: DbBulletinRow;
  try {
    updated = await prisma.bulletin.update({ where: { id }, data: { isPublished } });
  } catch (err) {
    if (isRecordMissing(err)) return null;
    throw err;
  }
  const record = mapDbBulletin(updated);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: isPublished ? "BULLETIN_PUBLISHED" : "BULLETIN_UNPUBLISHED",
    entity: "Bulletin",
    entityId: id,
    details: { title: record.title, isPublished },
  });

  return record;
}

export async function setServerBulletinPinned(
  id: string,
  isPinned: boolean,
  actor: SessionUser
): Promise<BulletinRecord | null> {
  // One round trip; see setServerBulletinPublished.
  let updated: DbBulletinRow;
  try {
    updated = await prisma.bulletin.update({ where: { id }, data: { isPinned } });
  } catch (err) {
    if (isRecordMissing(err)) return null;
    throw err;
  }
  const record = mapDbBulletin(updated);

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: isPinned ? "BULLETIN_PINNED" : "BULLETIN_UNPINNED",
    entity: "Bulletin",
    entityId: id,
    details: { title: record.title, isPinned },
  });

  return record;
}

export async function deleteServerBulletin(id: string, actor: SessionUser): Promise<boolean> {
  const existing = await prisma.bulletin.findUnique({ where: { id } });
  if (!existing) return false;

  const record = mapDbBulletin(existing);
  try {
    await prisma.bulletin.delete({ where: { id } });
  } catch (err) {
    // Deleted by someone else between the read above and this write.
    if (isRecordMissing(err)) return false;
    throw err;
  }

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "BULLETIN_DELETED",
    entity: "Bulletin",
    entityId: id,
    // The whole notice, because a delete is the one change nothing else records.
    //
    // ceiling: this audit write is fire-and-forget, as it is for every content
    // type in this repo (FAQ, transparency), so a failed write after a
    // successful delete leaves no record. Making it transactional through
    // `persistAuditLog(tx, …)` is a repo-wide durability decision, not a
    // bulletin one; see tasks/decisions/2026-09-22-bulletins-get-a-server-side-store.md.
    details: auditableState(record),
  });

  return true;
}
