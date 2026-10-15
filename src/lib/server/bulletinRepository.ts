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
  shelterToday,
  startOfNextShelterDay,
} from "@/lib/domain/bulletinSchedule";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { SessionUser } from "@/lib/security/session";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError, isDatabasePersistent } from "@/lib/persistenceMode";

/**
 * Bulletin reads and writes over the repository layer.
 *
 * Storage follows `./faqRepository` with one deliberate departure. Prisma is
 * the source; the committed `src/data/bulletins.json` fixture is what serves
 * when there is no database (local development, the unit suite) or when the
 * table does not exist yet. Unlike FAQ, a *failed* read against a database that
 * holds staff content does not serve the fixture in production — it serves no
 * notices; `mayServeFixtureAfter` says why. As with FAQ, an *empty* result is an
 * answer, not an outage; see `getPublicBulletins`.
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
  warnedTableMissing = false;
}

/**
 * `DbBulletinRow` is Prisma's generated `Bulletin` type, imported above — not a
 * hand-copied interface. An earlier revision kept its own copy and cast every
 * query result through `as unknown as`, which switched off the one check that
 * matters here: a renamed or retyped column would have typechecked and then
 * mapped to `undefined` on every card and every audit entry.
 */

/**
 * Resolves to `null` when Prisma reports the row gone (P2025); rethrows
 * anything else.
 *
 * Reached when a notice is deleted between an editor opening it and acting on
 * it, and mapped to the action's "no longer exists" rather than a generic
 * failure with a logged stack. The same shape as the private helper of the same
 * name in `./transparencyRepository` — two copies, which AGENTS.md's
 * "Boundaries and duplication" says to leave until a third occurrence.
 */
async function orNullIfMissing<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (err) {
    if (prismaCode(err) === "P2025") return null;
    throw err;
  }
}

function prismaCode(err: unknown): unknown {
  return typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
}

/**
 * The `bulletins` table does not exist (P2021): a database the hand-run
 * migration has not reached. Running that migration is the fix.
 *
 * Exported because the action layer must tell an editor *why* nothing saves —
 * `isDatabaseUnavailable` covers connectivity, not a schema never applied.
 */
export function isBulletinTableMissing(err: unknown): boolean {
  return prismaCode(err) === "P2021";
}

/**
 * The table exists but a column the code expects does not (P2022): a schema
 * that has drifted behind the code. Kept apart from a missing table because the
 * fix differs — re-running the bulletin migration cannot help (it only creates
 * what is absent, with `IF NOT EXISTS`), so an editor sent there would be sent
 * to the wrong place.
 */
export function isBulletinColumnMissing(err: unknown): boolean {
  return prismaCode(err) === "P2022";
}

/**
 * Whether the "table does not exist yet" warning has been logged in this
 * process. See the P2021 branch in `getPublicBulletins`, which sets it.
 * `resetBulletins` clears it, deliberately: that reset is test-only and
 * clearing the flag is what keeps one test's warning from silencing the next.
 */
let warnedTableMissing = false;

/**
 * Whether a failed public read may fall back to the committed fixture.
 *
 * - **No database configured** (`isDatabasePersistent()` false): yes. The
 *   fixture is the only data there is — local development, the unit suite, and
 *   a `next build` with no `DATABASE_URL`. An earlier revision asked
 *   `NODE_ENV` instead, which is the wrong question: a production build with no
 *   database then prerendered an empty feed and logged an error per page.
 * - **Outside production**: yes, for the same development convenience.
 * - **In production, table missing (P2021)**: yes. That is a deploy that landed
 *   before the migration, and the fixture is precisely the launch content the
 *   migration would seed — what visitors saw before this feature existed.
 * - **In production, anything else**: no. Once the table exists, staff own its
 *   contents. Serving the fixture on a transient failure would bring back
 *   notices staff have deleted or unpublished and hide everything they posted,
 *   and `/` and `/bulletins` are ISR, so that render would be cached as the good
 *   page for up to five minutes. A missing *column* (P2022) is in this branch
 *   too: the table exists and holds staff content under a drifted schema.
 *
 * Why no notices rather than throwing, which on an ISR page would keep serving
 * the last good render: `/` reads pets, impact stats and bulletins in one
 * `Promise.all`, so a throw on a cold render (a fresh deploy, a new region)
 * takes the whole home page down to the error boundary over one section; and
 * `/pets` is `force-dynamic`, where it would fail every request for as long as
 * the outage lasted. Losing the news section beats losing the page. The feed's
 * empty state is worded to be true in both cases ("No updates to show right
 * now"), rather than claiming nothing has been posted.
 */
function mayServeFixtureAfter(err: unknown): boolean {
  if (!isDatabasePersistent()) return true;
  if (process.env.NODE_ENV !== "production") return true;
  return isBulletinTableMissing(err);
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
 * feed. That much is the settled repo-wide position;
 * `tests/integration/faqEmptyPublishSet.test.ts` pins it for FAQ. What a
 * *thrown* error serves is narrower here than for FAQ: see
 * `mayServeFixtureAfter`.
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
  // One instant for the whole request, so the query's bound and the fixture
  // path's "today" cannot straddle the shelter's midnight between them.
  const now = new Date();
  try {
    const rows = await prisma.bulletin.findMany({
      where: {
        isPublished: true,
        // A future notice date schedules the notice; see
        // `@/lib/domain/bulletinSchedule` for why "today" is the shelter's day.
        publishedAt: { lt: startOfNextShelterDay(now) },
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
    // `handlePersistenceError` logs only in development, so in production each
    // branch below logs for itself — including the one that serves the fixture,
    // which is the likeliest production failure of all (deployed before the
    // migration) and would otherwise leave no trace in the logs.
    if (!mayServeFixtureAfter(err)) {
      console.error(
        "[bulletins] public read failed; serving no notices rather than the launch fixture",
        err
      );
      return [];
    }
    if (process.env.NODE_ENV === "production" && isDatabasePersistent() && !warnedTableMissing) {
      // Once per process. `/pets` is force-dynamic, so a per-request warning
      // would log on every visit until someone applied the migration — useful
      // once, then noise that buries everything else in the logs.
      warnedTableMissing = true;
      console.warn(
        "[bulletins] the bulletins table does not exist yet; serving the launch fixture. " +
          "Apply prisma/migrations/manual/20260922_community_bulletins."
      );
    }
  }

  // Slice before projecting: `toBulletin` runs the URL allow-list, which builds
  // a `URL` per field, and there is no reason to do that for rows about to be
  // discarded. The query path already gets this right by pushing `take` down.
  const today = shelterToday(now);
  const ordered = sortBulletinsForFeed(
    serverBulletins.filter(
      (b) =>
        b.isPublished &&
        // One "today" for the whole pass; see `isScheduledForLater`.
        !isScheduledForLater(b.publishedAt, today) &&
        matchesTarget(b, targetPage)
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

/**
 * The fields an editor controls, shared by create and update.
 *
 * `authorName` is deliberately NOT here: a create takes it from the acting
 * session, an update must leave it alone, and neither may take it from the
 * form. Keeping it out of the shared shape means a future field cannot pick up
 * the byline by accident.
 */
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
  // Null if someone else deleted it between the read above and this write.
  const updated = await orNullIfMissing(() =>
    prisma.bulletin.update({ where: { id }, data: editablePayload(values) })
  );
  if (!updated) return null;
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
  const updated = await orNullIfMissing(() =>
    prisma.bulletin.update({ where: { id }, data: { isPublished } })
  );
  if (!updated) return null;
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
  const updated = await orNullIfMissing(() =>
    prisma.bulletin.update({ where: { id }, data: { isPinned } })
  );
  if (!updated) return null;
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
  // `delete` returns the row it removed, so that is what the audit records.
  // Reading it first was an extra round trip and a race: an edit landing
  // between the read and the delete meant the audit kept the *older* notice,
  // not the one actually deleted — the opposite of "the whole notice".
  const deleted = await orNullIfMissing(() => prisma.bulletin.delete({ where: { id } }));
  if (!deleted) return false;
  const record = mapDbBulletin(deleted);

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
