export type BulletinCategory =
  | "announcement"
  | "urgent_need"
  | "event"
  | "happy_tail"
  | "clinic";

export type BulletinTargetPage = "all" | "home" | "pets" | "bulletins";

export type BulletinMediaType = "image" | "video" | "none";

/**
 * One bulletin as the public feed renders it.
 *
 * The public projection, mirroring `FaqItem` against `FaqRecord` next door.
 *
 * It deliberately carries **no Malay fields**. The columns exist and the editor
 * writes them, but nothing renders them yet, so there is no resolution step
 * here and none is implied. Adding `titleMs` to this interface without also
 * adding the `titleMs ?? title` fallback in `bulletinRepository.toBulletin`
 * would ship a blank Malay title for every untranslated row.
 *
 * `publishedAt` is an ISO date string (`YYYY-MM-DD`) rather than a `Date`,
 * because it is a notice date that a card prints verbatim — not an instant. It
 * crosses a server/client boundary as a prop, and a `Date` would be serialised
 * and revived into whatever the viewer's timezone made of it, which is how a
 * clinic "this Saturday" becomes Friday for anyone west of the shelter.
 */
export interface Bulletin {
  id: string;
  title: string;
  content: string;
  category: BulletinCategory;
  targetPage: BulletinTargetPage;
  mediaType: BulletinMediaType;
  /** Absent unless it passed the host allow-list; see `@/lib/domain/bulletinMedia`. */
  mediaUrl?: string;
  /** Absent unless it passed the embed host allow-list. */
  videoEmbedUrl?: string;
  isPinned: boolean;
  publishedAt: string;
  authorName: string;
}

/**
 * One bulletin row exactly as stored, for the admin editor.
 *
 * The editor needs the unresolved Malay values — otherwise saving a notice that
 * has no translation would silently write the English copy into the Malay
 * column and freeze it there, so a later edit to the English would no longer
 * show through. Same reasoning as `FaqRecord`.
 *
 * `mediaUrl` and `videoEmbedUrl` are NOT filtered here. The editor must see the
 * value that is actually stored, including one a fixture or a hand-run
 * migration inserted past the action, or it cannot be corrected.
 */
export interface BulletinRecord {
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
  createdAt: string;
  updatedAt: string;
}
