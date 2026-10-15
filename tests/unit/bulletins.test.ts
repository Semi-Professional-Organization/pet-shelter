import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BULLETIN_EMBED_HOSTS,
  BULLETIN_EMBED_RULES,
  BULLETIN_IMAGE_HOSTS,
  isAllowedBulletinEmbedUrl,
  isAllowedBulletinImageUrl,
  toPublicEmbedUrl,
  toPublicMediaUrl,
} from "@/lib/domain/bulletinMedia";
import {
  BULLETIN_CATEGORIES,
  BULLETIN_MEDIA_TYPES,
  BULLETIN_TARGET_PAGES,
  bulletinFormSchema,
  type BulletinFormInput,
} from "@/lib/validations/bulletin";
import type { SessionUser } from "@/lib/security/session";
import fixtureJson from "@/data/bulletins.json";
import {
  BULLETIN_TARGET_PAGE_LABELS,
  isKnownBulletinCategory,
  normaliseBulletinCategory,
  presentBulletinCategory,
} from "@/lib/presentation/bulletinPresentation";
import { getRevalidatedPaths, revalidatePathSpy } from "../setup/nextMocks";
import {
  isScheduledForLater,
  shelterToday,
  startOfNextShelterDay,
} from "@/lib/domain/bulletinSchedule";
import {
  BULLETIN_FEED_ORDER_BY,
  sortBulletinsForFeed,
} from "@/lib/domain/bulletinOrdering";

/**
 * Community bulletins: media allow-list, authorisation, fallback policy.
 *
 * `DATABASE_URL` points at a Neon PRODUCTION branch, so Prisma is mocked for the
 * whole file — no test here can reach a database. The mock is per-test
 * configurable so the database code path is genuinely exercised rather than
 * skipped, which is what lets the empty-vs-outage pair below mean anything.
 *
 * Every module that touches `@/lib/server/prisma` is imported **dynamically,
 * inside the test body**. A static import would instantiate the repository — and
 * the real client — before `vi.mock` registers, and the spies below would then
 * observe zero calls while this file reported green.
 */
const prismaMock = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  });
  return {
    bulletin: model(),
    auditLog: { create: vi.fn(() => Promise.resolve({})) },
  };
});

vi.mock("@/lib/server/prisma", () => ({ prisma: prismaMock }));

// The real `shelterToday`, wrapped so a test can count how often the repository
// asks for "today". Behaviour is unchanged.
vi.mock("@/lib/domain/bulletinSchedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/bulletinSchedule")>();
  return { ...actual, shelterToday: vi.fn(actual.shelterToday) };
});

const sessionMock = vi.hoisted(() => ({ getCurrentSession: vi.fn() }));
vi.mock("@/lib/security/session", () => sessionMock);

// The actions resolve their principal through the DAL, which re-reads the member's row.
// Answered here as a reachable database would answer for an active member holding the
// cookie's role. Without it the mocked Prisma above has no `user` model, the lookup throws,
// and every authorisation test in this file would pass through the DAL's database-outage
// path instead — the right answers for the wrong reason.
vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(async (id: string) => {
    const session = await sessionMock.getCurrentSession();
    return session && session.id === id
      ? { role: session.role, status: "ACTIVE", name: session.name, email: session.email }
      : null;
  }),
}));

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const ADMIN: SessionUser = {
  id: "usr-admin-01",
  email: "admin@hopeforstrays.org",
  name: "Admin",
  role: "SUPER_ADMIN" as const,
  expiresAt: Date.now() + 3_600_000,
};
const CONTENT_EDITOR: SessionUser = {
  ...ADMIN,
  id: "usr-editor-01",
  name: "Content Editor",
  email: "editor@hopeforstrays.org",
  role: "CONTENT_EDITOR" as const,
};
// Legacy alias: normalises to SUPER_ADMIN, so it keeps access.
const LEGACY_ADMIN: SessionUser = { ...ADMIN, id: "usr-legacy-01", role: "ADMIN" as const };
const COORDINATOR: SessionUser = { ...ADMIN, id: "usr-coord-01", role: "COORDINATOR" as const };
const STAFF: SessionUser = { ...ADMIN, id: "usr-staff-01", role: "STAFF" as const };
const VOLUNTEER: SessionUser = { ...ADMIN, id: "usr-vol-01", role: "VOLUNTEER" as const };

const ALLOWED_IMAGE = "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def";
const ALLOWED_EMBED = "https://www.youtube-nocookie.com/embed/abc";
const HOSTILE_EMBED = "https://evil.example.com/embed/x";
const HOSTILE_IMAGE = "https://evil.example.com/tracker.png";

/** The minimum a form must carry; every other field has a schema default. */
function formInput(over: Partial<BulletinFormInput> = {}): BulletinFormInput {
  return {
    category: "announcement",
    title: "Clinic day moved to Sunday",
    content: "The microchip clinic moves to Sunday morning this week.",
    publishedAt: "2026-08-14",
    ...over,
  } as BulletinFormInput;
}

/** One database row, shaped as Prisma returns it (`Date`s, not strings). */
interface DbRow {
  id: string;
  title: string;
  content: string;
  titleMs: string | null;
  contentMs: string | null;
  category: string;
  targetPage: string;
  mediaType: string;
  mediaUrl: string | null;
  videoEmbedUrl: string | null;
  isPinned: boolean;
  isPublished: boolean;
  authorName: string;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function dbRow(over: Partial<DbRow> = {}): DbRow {
  return {
    id: "bulletin-db-1",
    title: "A notice from the database",
    content: "Body copy long enough to be a real notice.",
    titleMs: null,
    contentMs: null,
    category: "announcement",
    targetPage: "all",
    mediaType: "none",
    mediaUrl: null,
    videoEmbedUrl: null,
    isPinned: false,
    isPublished: true,
    authorName: "Shelter Team",
    publishedAt: new Date("2026-08-14T00:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...over,
  };
}

type AnySpy = { mock: { calls: unknown[][] } };

/** The `data` object of the most recent Prisma write, without an `any` cast at each site. */
function lastWriteData(spy: AnySpy): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  return (call?.[0] as { data: Record<string, unknown> }).data;
}

/** The first argument of the most recent Prisma read. */
function lastQuery(spy: AnySpy): Record<string, unknown> {
  return (spy.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
}

/** Makes every bulletin query reject the way an unreachable server does. */
function makeDatabaseUnreachable(): void {
  const unreachable = () => {
    const err = new Error("Can't reach database server") as Error & { code: string };
    err.name = "PrismaClientKnownRequestError";
    err.code = "P1001";
    return Promise.reject(err);
  };
  for (const fn of Object.values(prismaMock.bulletin)) {
    (fn as ReturnType<typeof vi.fn>).mockImplementation(unreachable);
  }
}

/** Answers every bulletin write, echoing the payload back as a stored row. */
function makeDatabaseWritable(): void {
  prismaMock.bulletin.findMany.mockResolvedValue([]);
  prismaMock.bulletin.findUnique.mockResolvedValue(dbRow());
  prismaMock.bulletin.create.mockImplementation((args: { data: Partial<DbRow> }) =>
    Promise.resolve({ ...dbRow(), id: "bulletin-created", ...args.data })
  );
  prismaMock.bulletin.update.mockImplementation((args: { data: Partial<DbRow> }) =>
    Promise.resolve({ ...dbRow(), ...args.data })
  );
  prismaMock.bulletin.delete.mockResolvedValue(dbRow());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Not strict, so the repository's documented fallback runs. The integration
  // tier sets STRICT_PERSISTENCE=true; `persistenceMode` reads it per call.
  vi.stubEnv("STRICT_PERSISTENCE", "false");
  makeDatabaseWritable();
  sessionMock.getCurrentSession.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  // Restores every `vi.spyOn(console, ...)` even when the test failed before
  // its own `mockRestore()`, so one failure cannot mute console for the rest
  // of the file. Since Vitest 3 this leaves `vi.fn()` mocks — Prisma's — alone.
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* K5a — the host allow-list itself                                            */
/* -------------------------------------------------------------------------- */

describe("bulletin media allow-list", () => {
  it.each([
    ["an https image host on the list", ALLOWED_IMAGE, true],
    ["a bare unknown host", HOSTILE_IMAGE, false],
    ["a javascript: URL", "javascript:alert(1)", false],
    ["a data: URL", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", false],
    ["http rather than https", "http://images.unsplash.com/x.png", false],
    ["a suffix look-alike host", "https://images.unsplash.com.evil.com/x.png", false],
    ["a relative path", "/local/x.png", false],
    ["credentials smuggled into the authority", "https://a:b@images.unsplash.com/x.png", false],
  ])("isAllowedBulletinImageUrl rejects or admits %s", (_label, url, expected) => {
    expect(isAllowedBulletinImageUrl(url as string)).toBe(expected);
  });

  it.each([
    ["youtube-nocookie", ALLOWED_EMBED, true],
    ["player.vimeo.com", "https://player.vimeo.com/video/12345", true],
    ["an arbitrary third-party frame", HOSTILE_EMBED, false],
    ["a javascript: URL", "javascript:alert(1)", false],
    ["http rather than https", "http://www.youtube.com/embed/x", false],
    ["a suffix look-alike host", "https://www.youtube.com.evil.com/embed/x", false],
  ])("isAllowedBulletinEmbedUrl rejects or admits %s", (_label, url, expected) => {
    expect(isAllowedBulletinEmbedUrl(url as string)).toBe(expected);
  });

  it("keeps the embed list narrower than the image list", () => {
    // An image host can serve the wrong picture; an embed host runs code in the
    // shelter's frame. Anything that widens the embed list to an image CDN
    // should have to change this line on purpose.
    for (const host of BULLETIN_EMBED_HOSTS) {
      expect(BULLETIN_IMAGE_HOSTS as readonly string[]).not.toContain(host);
    }
  });

  it("reads `**.` the way next.config does: one label or many", () => {
    expect(isAllowedBulletinImageUrl("https://myproject.supabase.co/x.png")).toBe(true);
    // Multi-label subdomains are real — `<project>.storage.supabase.co` — and
    // next.config's `**.supabase.co` accepts them. An earlier revision matched
    // exactly one label and so refused URLs next/image would have served,
    // telling the editor to consult a config file that did allow them.
    expect(isAllowedBulletinImageUrl("https://a.b.supabase.co/x.png")).toBe(true);

    // The boundary still holds where it matters. The suffix carries its dot, so
    // neither the bare apex nor a look-alike registrable domain inherits it.
    expect(isAllowedBulletinImageUrl("https://supabase.co/x.png")).toBe(false);
    expect(isAllowedBulletinImageUrl("https://evilsupabase.co/x.png")).toBe(false);
    expect(isAllowedBulletinImageUrl("https://supabase.co.evil.com/x.png")).toBe(false);
  });

  it("requires an embeddable path, not just an allowed host", () => {
    // A watch-page link is on an allowed host and is NOT embeddable: YouTube
    // serves /watch with X-Frame-Options SAMEORIGIN, so it would validate
    // cleanly and then render as an unexplained black box on three public
    // pages. The form already tells staff to use the embed link.
    expect(
      isAllowedBulletinEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe(false);
    expect(isAllowedBulletinEmbedUrl("https://www.youtube.com/")).toBe(false);
    expect(isAllowedBulletinEmbedUrl("https://player.vimeo.com/xyz")).toBe(false);

    expect(isAllowedBulletinEmbedUrl("https://www.youtube.com/embed/abc")).toBe(true);
    expect(
      isAllowedBulletinEmbedUrl("https://www.youtube-nocookie.com/embed/abc")
    ).toBe(true);
    expect(isAllowedBulletinEmbedUrl("https://player.vimeo.com/video/123")).toBe(true);
  });

  it("passes an allowed URL through and drops everything else", () => {
    expect(toPublicMediaUrl(ALLOWED_IMAGE)).toBe(ALLOWED_IMAGE);
    expect(toPublicMediaUrl(HOSTILE_IMAGE)).toBeUndefined();
    expect(toPublicMediaUrl(null)).toBeUndefined();
    expect(toPublicMediaUrl(undefined)).toBeUndefined();
    expect(toPublicMediaUrl("")).toBeUndefined();

    expect(toPublicEmbedUrl(ALLOWED_EMBED)).toBe(ALLOWED_EMBED);
    expect(toPublicEmbedUrl(HOSTILE_EMBED)).toBeUndefined();
    expect(toPublicEmbedUrl(null)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* K5b — the write side: bulletinFormSchema                                    */
/* -------------------------------------------------------------------------- */

describe("bulletinFormSchema", () => {
  const parse = (over: Partial<BulletinFormInput>) => bulletinFormSchema.safeParse(formInput(over));

  it("accepts the minimum an editor must type, with defaults filled in", () => {
    const res = bulletinFormSchema.safeParse(formInput());
    expect(res.success).toBe(true);
    expect(res.data?.targetPage).toBe("all");
    expect(res.data?.mediaType).toBe("none");
    expect(res.data?.isPublished).toBe(true);
    expect(res.data?.isPinned).toBe(false);
  });

  it.each([
    ["an arbitrary third-party frame", HOSTILE_EMBED],
    ["a javascript: URL", "javascript:alert(1)"],
    ["http rather than https", "http://www.youtube.com/embed/x"],
    ["a suffix look-alike host", "https://www.youtube.com.evil.com/embed/x"],
  ])("rejects a videoEmbedUrl that is %s", (_label, url) => {
    const res = parse({ mediaType: "video", videoEmbedUrl: url });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path.includes("videoEmbedUrl"))).toBe(true);
  });

  it("accepts a youtube-nocookie embed", () => {
    const res = parse({ mediaType: "video", videoEmbedUrl: ALLOWED_EMBED });
    expect(res.success).toBe(true);
    expect(res.data?.videoEmbedUrl).toBe(ALLOWED_EMBED);
  });

  it.each([
    ["an unknown host", HOSTILE_IMAGE],
    ["a javascript: URL", "javascript:alert(1)"],
    ["http rather than https", "http://images.unsplash.com/x.png"],
    ["a suffix look-alike host", "https://images.unsplash.com.evil.com/x.png"],
    ["the bare Supabase apex", "https://supabase.co/x.png"],
  ])("rejects a mediaUrl that is %s", (_label, url) => {
    const res = parse({ mediaType: "image", mediaUrl: url });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path.includes("mediaUrl"))).toBe(true);
  });

  it.each([
    ["an allow-listed CDN", ALLOWED_IMAGE],
    ["one label under the Supabase wildcard", "https://myproject.supabase.co/x.png"],
    ["two labels under it, as next.config allows", "https://a.b.supabase.co/x.png"],
  ])("accepts a mediaUrl on %s", (_label, url) => {
    const res = parse({ mediaType: "image", mediaUrl: url });
    expect(res.success).toBe(true);
    expect(res.data?.mediaUrl).toBe(url);
  });

  it("refuses a media type whose URL is missing", () => {
    // A card renders media only when `mediaType` says so, so a type without its
    // URL is a notice whose picture silently never appears.
    const image = parse({ mediaType: "image" });
    expect(image.success).toBe(false);
    expect(image.error?.issues.some((i) => i.path.includes("mediaUrl"))).toBe(true);

    const video = parse({ mediaType: "video" });
    expect(video.success).toBe(false);
    expect(video.error?.issues.some((i) => i.path.includes("videoEmbedUrl"))).toBe(true);
  });

  it("accepts mediaType none carrying a stray URL", () => {
    // Accepted at the schema, discarded at the repository — see the write-payload
    // test below. The editor who switched a card back to None is not shown an error.
    const res = parse({ mediaType: "none", mediaUrl: ALLOWED_IMAGE, videoEmbedUrl: ALLOWED_EMBED });
    expect(res.success).toBe(true);
  });

  it("requires a YYYY-MM-DD notice date", () => {
    expect(parse({ publishedAt: "14/08/2026" }).success).toBe(false);
    expect(parse({ publishedAt: "2026-8-14" }).success).toBe(false);
    expect(parse({ publishedAt: "2026-08-14T00:00:00Z" }).success).toBe(false);
    expect(parse({ publishedAt: "2026-08-14" }).success).toBe(true);
  });

  it("keeps the vocabularies it publishes in step with the type union", () => {
    for (const category of BULLETIN_CATEGORIES) {
      expect(parse({ category }).success).toBe(true);
    }
    for (const targetPage of BULLETIN_TARGET_PAGES) {
      expect(parse({ targetPage }).success).toBe(true);
    }
    expect(BULLETIN_MEDIA_TYPES).toEqual(["none", "image", "video"]);
    expect(parse({ category: "gossip" as BulletinFormInput["category"] }).success).toBe(false);
    expect(parse({ targetPage: "admin" as BulletinFormInput["targetPage"] }).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* K4 — authorisation                                                          */
/* -------------------------------------------------------------------------- */

/** One invocation per write action, so each is gated on its own evidence. */
const WRITE_ACTIONS: Array<[string, () => Promise<{ success: boolean; error?: string }>]> = [
  [
    "createBulletinAction",
    async () => (await import("@/actions/bulletins")).createBulletinAction(formInput()),
  ],
  [
    "updateBulletinAction",
    async () =>
      (await import("@/actions/bulletins")).updateBulletinAction("bulletin-db-1", formInput()),
  ],
  [
    "setBulletinPublishedAction",
    async () =>
      (await import("@/actions/bulletins")).setBulletinPublishedAction("bulletin-db-1", true),
  ],
  [
    "setBulletinPinnedAction",
    async () => (await import("@/actions/bulletins")).setBulletinPinnedAction("bulletin-db-1", true),
  ],
  [
    "deleteBulletinAction",
    async () => (await import("@/actions/bulletins")).deleteBulletinAction("bulletin-db-1"),
  ],
];

describe("bulletin actions - authorisation", () => {
  it.each(WRITE_ACTIONS)("refuses %s from an unauthenticated visitor", async (_name, invoke) => {
    sessionMock.getCurrentSession.mockResolvedValue(null);

    const res = await invoke();

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sign in|Authentication/i);
    // The gate has to stop the write, not merely report on it afterwards.
    expect(prismaMock.bulletin.create).not.toHaveBeenCalled();
    expect(prismaMock.bulletin.update).not.toHaveBeenCalled();
    expect(prismaMock.bulletin.delete).not.toHaveBeenCalled();
  });

  // The gate is the MANAGE_CONTENT capability, held only by SUPER_ADMIN and
  // CONTENT_EDITOR. COORDINATOR normalises to VOLUNTEER_COORDINATOR, which does
  // not hold it: a coordinator may review applications, not publish notices to
  // every public page under the shelter's name.
  const DENIED: Array<[string, SessionUser]> = [
    ["STAFF", STAFF],
    ["VOLUNTEER", VOLUNTEER],
    ["COORDINATOR", COORDINATOR],
  ];

  it.each(
    DENIED.flatMap(([role, user]) =>
      WRITE_ACTIONS.map(([name, invoke]) => [role, name, user, invoke] as const)
    )
  )("refuses %s calling %s", async (_role, _name, user, invoke) => {
    sessionMock.getCurrentSession.mockResolvedValue(user);

    const res = await invoke();

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not authorized/i);
    expect(prismaMock.bulletin.create).not.toHaveBeenCalled();
    expect(prismaMock.bulletin.update).not.toHaveBeenCalled();
    expect(prismaMock.bulletin.delete).not.toHaveBeenCalled();
  });

  const ALLOWED: Array<[string, SessionUser]> = [
    ["SUPER_ADMIN", ADMIN],
    ["CONTENT_EDITOR", CONTENT_EDITOR],
    ["ADMIN (legacy alias for SUPER_ADMIN)", LEGACY_ADMIN],
  ];

  it.each(
    ALLOWED.flatMap(([role, user]) =>
      WRITE_ACTIONS.map(([name, invoke]) => [role, name, user, invoke] as const)
    )
  )("allows %s to call %s", async (_role, _name, user, invoke) => {
    sessionMock.getCurrentSession.mockResolvedValue(user);

    const res = await invoke();

    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);
  });

  it("gates the admin list, so a draft is not readable without MANAGE_CONTENT", async () => {
    // The one row the database holds is unpublished — staff-only by definition.
    prismaMock.bulletin.findMany.mockResolvedValue([
      dbRow({ id: "bulletin-draft", title: "Embargoed: clinic closure", isPublished: false }),
    ]);
    const { listBulletinsAction } = await import("@/actions/bulletins");

    const anonymous = await listBulletinsAction();
    expect(anonymous.success).toBe(false);
    expect(anonymous.error).toMatch(/sign in|Authentication/i);
    expect(anonymous.data).toBeUndefined();

    for (const [, user] of DENIED) {
      sessionMock.getCurrentSession.mockResolvedValue(user);
      const denied = await listBulletinsAction();
      expect(denied.success).toBe(false);
      expect(denied.error).toMatch(/not authorized/i);
      expect(denied.data).toBeUndefined();
    }

    // The gate runs before the query, so the draft never left the database.
    expect(prismaMock.bulletin.findMany).not.toHaveBeenCalled();

    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    const allowed = await listBulletinsAction();
    expect(allowed.success).toBe(true);
    expect(allowed.data?.map((r) => r.id)).toEqual(["bulletin-draft"]);
    expect(allowed.data?.[0].isPublished).toBe(false);
  });

  it("surfaces an outage to the editor instead of serving fixture rows", async () => {
    // The admin list has no fixture fallback on purpose: those ids need not
    // exist in the database, so every Edit and Delete on them would fail with
    // "not found" while the table insisted the data was there.
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    makeDatabaseUnreachable();
    const { listBulletinsAction } = await import("@/actions/bulletins");

    const res = await listBulletinsAction();

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/database is unavailable/i);
    expect(res.data).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* K4b — the byline cannot be forged                                           */
/* -------------------------------------------------------------------------- */

describe("bulletin byline", () => {
  it("takes authorName from the session, never from the form", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    const { createBulletinAction } = await import("@/actions/bulletins");

    const res = await createBulletinAction(
      // A hostile client posts whatever it likes; the action is the only thing
      // between that and a notice published under a colleague's name.
      { ...formInput(), authorName: "Someone Else" } as BulletinFormInput
    );

    expect(res.success).toBe(true);
    const data = lastWriteData(prismaMock.bulletin.create);
    expect(data.authorName).toBe(CONTENT_EDITOR.name);
    expect(JSON.stringify(data)).not.toContain("Someone Else");
  });

  it("does not reassign the byline on an edit", async () => {
    // Correcting a colleague's typo must not put your name on their notice, so
    // the update payload carries no `authorName` at all.
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const { updateBulletinAction } = await import("@/actions/bulletins");

    const res = await updateBulletinAction("bulletin-db-1", {
      ...formInput({ title: "Clinic day moved to Monday" }),
      authorName: "Someone Else",
    } as BulletinFormInput);

    expect(res.success).toBe(true);
    const data = lastWriteData(prismaMock.bulletin.update);
    expect(Object.keys(data)).not.toContain("authorName");
    expect(JSON.stringify(data)).not.toContain("Someone Else");
  });
});

/* -------------------------------------------------------------------------- */
/* Write payload: media discipline and the notice date                         */
/* -------------------------------------------------------------------------- */

describe("bulletin write payload", () => {
  beforeEach(() => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
  });

  it("keeps a URL only for the media type that will render it", async () => {
    const { createBulletinAction } = await import("@/actions/bulletins");

    await createBulletinAction(
      formInput({ mediaType: "none", mediaUrl: ALLOWED_IMAGE, videoEmbedUrl: ALLOWED_EMBED })
    );
    const none = lastWriteData(prismaMock.bulletin.create);
    // Not merely unrendered — not stored, so switching the card back to Image
    // later cannot resurrect an embed URL nobody re-reviewed.
    expect(none.mediaUrl).toBeNull();
    expect(none.videoEmbedUrl).toBeNull();

    await createBulletinAction(
      formInput({ mediaType: "image", mediaUrl: ALLOWED_IMAGE, videoEmbedUrl: ALLOWED_EMBED })
    );
    const image = lastWriteData(prismaMock.bulletin.create);
    expect(image.mediaUrl).toBe(ALLOWED_IMAGE);
    expect(image.videoEmbedUrl).toBeNull();

    await createBulletinAction(
      formInput({ mediaType: "video", mediaUrl: ALLOWED_IMAGE, videoEmbedUrl: ALLOWED_EMBED })
    );
    const video = lastWriteData(prismaMock.bulletin.create);
    expect(video.mediaUrl).toBeNull();
    expect(video.videoEmbedUrl).toBe(ALLOWED_EMBED);
  });

  it("round-trips a notice date without timezone drift", async () => {
    const { createBulletinAction, listBulletinsAction } = await import("@/actions/bulletins");

    await createBulletinAction(formInput({ publishedAt: "2026-08-14" }));

    const stored = lastWriteData(prismaMock.bulletin.create).publishedAt as Date;
    expect(stored).toBeInstanceOf(Date);
    // Midnight UTC exactly. A `new Date("2026-08-14T00:00:00")` without the Z
    // would be midnight *local* — 2026-08-13T16:00Z in Malaysia — and the clinic
    // announced for Friday would print as Thursday.
    expect(stored.toISOString()).toBe("2026-08-14T00:00:00.000Z");

    // And back out through the repository's own mapping, not just the parser.
    prismaMock.bulletin.findMany.mockResolvedValue([dbRow({ publishedAt: stored })]);
    const listed = await listBulletinsAction();
    expect(listed.data?.[0].publishedAt).toBe("2026-08-14");
  });

  it("revalidates every public surface that renders a bulletin", async () => {
    const { createBulletinAction } = await import("@/actions/bulletins");

    await createBulletinAction(formInput());

    const paths = getRevalidatedPaths().map((p) => p.path);
    // `/` carries revalidate = 300, so an omission here is a corrected notice
    // staying wrong on the home page for five minutes with nothing saying so.
    expect(paths).toContain("/");
    expect(paths).toContain("/pets");
    expect(paths).toContain("/bulletins");
    expect(paths).toContain("/admin/bulletins");
  });
});

/* -------------------------------------------------------------------------- */
/* K5c — the render side, and K3 — empty is an answer                          */
/* -------------------------------------------------------------------------- */

describe("getPublicBulletins", () => {
  it("strips a hostile embed URL a row carried past the action", async () => {
    // Rows reach this table without passing the action: `prisma/seed.ts` inserts
    // fixtures and the manual migration is applied by hand. This is the
    // enforcing half of the allow-list, and the only one those rows meet.
    prismaMock.bulletin.findMany.mockResolvedValue([
      dbRow({
        id: "bulletin-smuggled",
        mediaType: "video",
        videoEmbedUrl: HOSTILE_EMBED,
        title: "Seeded past the action",
      }),
    ]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    const [bulletin] = await getPublicBulletins("all");

    expect(bulletin.videoEmbedUrl).toBeUndefined();
    // The words still publish: one bad URL must not blank the feed, or nobody
    // could reach the admin screen to fix it.
    expect(bulletin.title).toBe("Seeded past the action");
  });

  it("strips a hostile image URL a row carried past the action", async () => {
    prismaMock.bulletin.findMany.mockResolvedValue([
      dbRow({ id: "bulletin-smuggled-img", mediaType: "image", mediaUrl: HOSTILE_IMAGE }),
    ]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    const [bulletin] = await getPublicBulletins("all");

    expect(bulletin.mediaUrl).toBeUndefined();
    expect(bulletin.content).toBe(dbRow().content);
  });

  it("keeps an allow-listed URL rather than stripping everything", async () => {
    // The other half of the guard: a reader that returned `undefined` for every
    // URL would pass the two tests above and render no media at all.
    prismaMock.bulletin.findMany.mockResolvedValue([
      dbRow({ mediaType: "image", mediaUrl: ALLOWED_IMAGE, videoEmbedUrl: ALLOWED_EMBED }),
    ]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    const [bulletin] = await getPublicBulletins("all");

    expect(bulletin.mediaUrl).toBe(ALLOWED_IMAGE);
    expect(bulletin.videoEmbedUrl).toBe(ALLOWED_EMBED);
  });

  it("returns nothing when the query succeeds with no rows", async () => {
    // Staff have unpublished everything, or nothing targets this page. That is
    // an answer. Substituting the fixture would resurrect retracted notices and
    // leave no admin action able to empty the feed.
    prismaMock.bulletin.findMany.mockResolvedValue([]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    const bulletins = await getPublicBulletins("all");

    expect(bulletins).toEqual([]);
    expect(bulletins).toHaveLength(0);
    // Stated separately so the failure names the fixture if the `catch`-only
    // fallback is ever changed back to a count check.
    expect(fixtureJson.length).toBeGreaterThan(0);
  });

  it("still falls back to the fixture when the query fails", async () => {
    // The other half: asserting only that empty stays empty would also pass
    // against a reader that had lost its fallback altogether.
    makeDatabaseUnreachable();
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    const bulletins = await getPublicBulletins("all");

    expect(bulletins.map((b) => b.id)).toEqual([
      // Pinned first, then newest.
      "bulletin-001",
      "bulletin-002",
      "bulletin-003",
      "bulletin-004",
    ]);
  });

  it("asks the database for published rows, this page's targets, pinned first", async () => {
    // The Prisma path delegates ordering and filtering to the database, so the
    // query itself is the only thing a test can hold to the contract.
    prismaMock.bulletin.findMany.mockResolvedValue([]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    await getPublicBulletins("home", 2);
    const scoped = lastQuery(prismaMock.bulletin.findMany);
    expect(scoped.where).toEqual({
      isPublished: true,
      // The schedule predicate: notices dated after the shelter's today stay off.
      publishedAt: { lt: expect.any(Date) },
      targetPage: { in: ["all", "home"] },
    });
    // Every tiebreaker DESC. `publishedAt` is a calendar day, so ties are
    // ordinary; an ASC tiebreaker resolves a tied day to the OLDEST notice and
    // a two-item feed would then drop the newest — the failure the tiebreaker
    // exists to prevent.
    expect(scoped.orderBy).toEqual([
      { isPinned: "desc" },
      { publishedAt: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);

    await getPublicBulletins("all");
    expect(lastQuery(prismaMock.bulletin.findMany).where).toEqual({
      isPublished: true,
      publishedAt: { lt: expect.any(Date) },
      targetPage: undefined,
    });
  });

  describe("ordering and target filtering (fixture path)", () => {
    beforeEach(() => {
      makeDatabaseUnreachable();
    });

    it("includes the page's own notices and the ones targeting every page", async () => {
      const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

      const home = await getPublicBulletins("home");
      // bulletin-001 targets "all", bulletin-002 targets "home".
      expect(home.map((b) => b.id)).toEqual(["bulletin-001", "bulletin-002"]);
      // bulletin-003 is bulletins-only and bulletin-004 is pets-only.
      expect(home.map((b) => b.id)).not.toContain("bulletin-003");
      expect(home.map((b) => b.id)).not.toContain("bulletin-004");

      const pets = await getPublicBulletins("pets");
      expect(pets.map((b) => b.id)).toEqual(["bulletin-001", "bulletin-004"]);
    });

    it("sorts pinned first, then newest, and applies the limit afterwards", async () => {
      // The shipped fixture cannot discriminate "pinned first" from "newest
      // first": its two pinned rows are also its two newest, so both orderings
      // produce the same list. The rule itself is tested directly against
      // `sortBulletinsForFeed`; this test is about the repository's fixture path,
      // whose store has no writer, so the one way to put a newer *unpinned*
      // notice in front is to add a row to the fixture the store clones on reset.
      await withExtraFixtureRow(
        {
          id: "bulletin-newest-unpinned",
          title: "Newest, but not pinned",
          content: "Posted after the pinned notices, and must still sort below them.",
          titleMs: null,
          contentMs: null,
          category: "announcement",
          targetPage: "home",
          mediaType: "none",
          mediaUrl: null,
          videoEmbedUrl: null,
          isPinned: false,
          isPublished: true,
          authorName: "Shelter Team",
          // Newer than both pinned notices but in the past, so it is visible.
          // It was 2026-12-31 until future dates began to schedule a notice;
          // that row is now hidden, which is the next test's subject.
          publishedAt: "2026-09-01",
        },
        async () => {
          const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

          const home = await getPublicBulletins("home");
          expect(home.map((b) => b.id)).toEqual([
            "bulletin-001", // pinned, 2026-08-14
            "bulletin-002", // pinned, 2026-08-12
            "bulletin-newest-unpinned", // 2026-09-01, newest, but unpinned
          ]);

          // The limit is applied after sorting, so the page gets the two
          // notices it would have shown — not the first two off the array.
          const limited = await getPublicBulletins("home", 2);
          expect(limited.map((b) => b.id)).toEqual(["bulletin-001", "bulletin-002"]);
        }
      );
    });

    it("keeps a published notice off the feeds until its date arrives", async () => {
      // A future notice date SCHEDULES the notice. Without the predicate it
      // published at once and took the top unpinned slot of the two-item feeds
      // on / and /pets above everything posted today, for as long as it stayed
      // the newest date. Dates are computed from the shelter's today, so this
      // test keeps meaning the same thing whenever it runs.
      const today = shelterToday();
      const tomorrow = shelterToday(new Date(Date.now() + 26 * 60 * 60 * 1000));
      const scheduledRow = (id: string, publishedAt: string) => ({
        id,
        title: `Notice dated ${publishedAt}`,
        content: "Body copy long enough to be a real notice.",
        titleMs: null,
        contentMs: null,
        category: "announcement",
        targetPage: "all",
        mediaType: "none",
        mediaUrl: null,
        videoEmbedUrl: null,
        isPinned: false,
        isPublished: true,
        authorName: "Shelter Team",
        publishedAt,
      });

      await withExtraFixtureRow(scheduledRow("bulletin-dated-tomorrow", tomorrow), async () => {
        await withExtraFixtureRow(scheduledRow("bulletin-dated-today", today), async () => {
          const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");
          const ids = (await getPublicBulletins("all")).map((b) => b.id);
          // Dated today: live. Dated tomorrow: not yet.
          expect(ids).toContain("bulletin-dated-today");
          expect(ids).not.toContain("bulletin-dated-tomorrow");
        });
      });
    });

    it("hides an unpublished notice from the public feed", async () => {
      await withExtraFixtureRow(
        {
          id: "bulletin-draft",
          title: "Embargoed until the vet confirms",
          content: "Draft copy that no visitor may see on any public page.",
          titleMs: null,
          contentMs: null,
          category: "announcement",
          targetPage: "all",
          mediaType: "none",
          mediaUrl: null,
          videoEmbedUrl: null,
          isPinned: true,
          isPublished: false,
          authorName: "Shelter Team",
          publishedAt: "2026-12-31",
        },
        async () => {
          const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");
          const all = await getPublicBulletins("all");
          expect(all.map((b) => b.id)).not.toContain("bulletin-draft");
        }
      );
    });
  });
});

/**
 * Runs `fn` with one extra row in the fallback fixture, then restores it.
 *
 * The fallback store clones `src/data/bulletins.json` on every `resetBulletins()`,
 * and the harness's global `beforeEach` calls that through `resetServerStore()`,
 * so the row is gone by the next test whether or not the `finally` runs.
 */
async function withExtraFixtureRow(row: unknown, fn: () => Promise<void>): Promise<void> {
  const rows = fixtureJson as unknown as unknown[];
  const { resetBulletins } = await import("@/lib/server/bulletinRepository");
  // Prepended rather than appended: a reader that applied `limit` BEFORE sorting
  // would then cut this row instead of the pinned ones, which is the only
  // arrangement that tells the two orders apart.
  rows.unshift(row);
  resetBulletins();
  try {
    await fn();
  } finally {
    rows.shift();
    resetBulletins();
  }
}

/* -------------------------------------------------------------------------- */
/* K6 — the shipped fixture                                                    */
/* -------------------------------------------------------------------------- */

describe("src/data/bulletins.json", () => {
  const rows = fixtureJson as unknown as Array<Record<string, unknown>>;

  it("ships rows at all", () => {
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("carries every key BulletinFixtureRow requires", () => {
    const required = [
      "id",
      "title",
      "content",
      "titleMs",
      "contentMs",
      "category",
      "targetPage",
      "mediaType",
      "mediaUrl",
      "videoEmbedUrl",
      "isPinned",
      "isPublished",
      "authorName",
      "publishedAt",
    ];
    for (const row of rows) {
      for (const key of required) {
        expect(Object.keys(row), `row ${String(row.id)} is missing ${key}`).toContain(key);
      }
      expect(typeof row.title).toBe("string");
      expect(typeof row.content).toBe("string");
      expect(typeof row.authorName).toBe("string");
      expect(typeof row.isPinned).toBe("boolean");
      expect(typeof row.isPublished).toBe("boolean");
      expect(String(row.title).trim().length).toBeGreaterThan(0);
      expect(String(row.content).trim().length).toBeGreaterThan(0);
    }
  });

  it("uses only the declared vocabularies", () => {
    for (const row of rows) {
      expect(BULLETIN_CATEGORIES as readonly string[]).toContain(row.category);
      expect(BULLETIN_TARGET_PAGES as readonly string[]).toContain(row.targetPage);
      expect(BULLETIN_MEDIA_TYPES as readonly string[]).toContain(row.mediaType);
    }
  });

  it("dates every notice as a plain calendar day", () => {
    for (const row of rows) {
      expect(String(row.publishedAt)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gives every row a unique id", () => {
    const ids = rows.map((r) => String(r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries no media URL that the allow-list would strip", () => {
    // This is what stops someone re-adding an arbitrary embed to the shipped
    // data: a fixture URL off the list renders as nothing, and the row would
    // look broken in production with no error anywhere.
    for (const row of rows) {
      if (row.mediaUrl) {
        expect(
          isAllowedBulletinImageUrl(String(row.mediaUrl)),
          `row ${String(row.id)} mediaUrl is not on BULLETIN_IMAGE_HOSTS`
        ).toBe(true);
      }
      if (row.videoEmbedUrl) {
        expect(
          isAllowedBulletinEmbedUrl(String(row.videoEmbedUrl)),
          `row ${String(row.id)} videoEmbedUrl is not on BULLETIN_EMBED_HOSTS`
        ).toBe(true);
      }
      // A declared media type with no URL is a card that renders nothing.
      if (row.mediaType === "image") expect(row.mediaUrl).toBeTruthy();
      if (row.mediaType === "video") expect(row.videoEmbedUrl).toBeTruthy();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* K7 — the two copies of the host list must agree                             */
/* -------------------------------------------------------------------------- */

describe("BULLETIN_IMAGE_HOSTS agrees with next.config.ts", () => {
  // Read as TEXT, not imported: `next.config.ts` is build configuration, and
  // importing it here would be the very coupling `bulletinMedia.ts` refuses.
  const source = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const remotePatterns = source.slice(source.indexOf("remotePatterns"));
  const configured = Array.from(remotePatterns.matchAll(/hostname:\s*"([^"]+)"/g)).map(
    (m) => m[1]
  );

  it("finds hostnames to compare at all", () => {
    // Without this, a renamed key would make every assertion below vacuous.
    expect(configured.length).toBeGreaterThan(0);
  });

  it("holds the two lists to the SAME set, in both directions", () => {
    // Containment one way is not enough, and the justification for duplicating
    // the list at all is that a test keeps the two honest. A host added to
    // next.config alone is served by next/image and refused by the form, whose
    // message then tells the editor to check images.remotePatterns — which
    // lists it. A host added here alone answers 400 from the optimizer.
    expect([...configured].sort()).toEqual([...BULLETIN_IMAGE_HOSTS].sort());
  });
});

/* -------------------------------------------------------------------------- */
/* Review round: the defects the 2026-09-22 review found, each pinned          */
/* -------------------------------------------------------------------------- */

describe("corrections from review", () => {
  const validForm = {
    category: "announcement" as const,
    targetPage: "all" as const,
    title: "A title long enough to pass",
    content: "Body copy that is comfortably long enough to pass.",
    mediaType: "none" as const,
    isPinned: false,
    isPublished: true,
    publishedAt: "2026-08-14",
  };

  it.each([
    ["31 February", "2026-02-31"],
    ["30 February", "2026-02-30"],
    ["31 April", "2026-04-31"],
    ["31 June", "2026-06-31"],
  ])("rejects %s, which Date.parse rolls forward instead of refusing", (_l, date) => {
    // `Date.parse("2026-02-31T00:00:00Z")` is NOT NaN — it yields 3 March. A
    // "does this parse" check accepted the date and the card then printed a
    // different day from the one the editor typed, which for a notice is the
    // whole content.
    const res = bulletinFormSchema.safeParse({ ...validForm, publishedAt: date });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path.includes("publishedAt"))).toBe(true);
  });

  it.each([
    ["29 February in a leap year", "2024-02-29"],
    ["the last day of a 30-day month", "2026-04-30"],
    ["the last day of a 31-day month", "2026-12-31"],
  ])("still accepts %s", (_l, date) => {
    expect(
      bulletinFormSchema.safeParse({ ...validForm, publishedAt: date }).success
    ).toBe(true);
  });

  it("ignores a stale URL belonging to a media type that is not selected", () => {
    // The dialog only renders the field for the SELECTED media type. Checking
    // the other one unconditionally meant an editor who pasted a bad link, was
    // told so, and then gave up by switching to None could never save: the
    // stale value kept failing and its input was no longer on screen.
    const res = bulletinFormSchema.safeParse({
      ...validForm,
      mediaType: "none",
      mediaUrl: "https://evil.example.com/x.png",
      videoEmbedUrl: "javascript:alert(1)",
    });
    expect(res.success).toBe(true);
  });

  it("still checks the URL belonging to the type that IS selected", () => {
    // The half that must not have been weakened by the fix above.
    expect(
      bulletinFormSchema.safeParse({
        ...validForm,
        mediaType: "image",
        mediaUrl: "https://evil.example.com/x.png",
      }).success
    ).toBe(false);
    expect(
      bulletinFormSchema.safeParse({
        ...validForm,
        mediaType: "video",
        videoEmbedUrl: "https://evil.example.com/embed/x",
      }).success
    ).toBe(false);
  });

  it("never stores the URL of an unselected media type", async () => {
    // The reason ignoring it above is safe: the repository nulls it, so an
    // unvalidated value is never written and never read back.
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    const { createBulletinAction } = await import("@/actions/bulletins");

    const res = await createBulletinAction({
      ...validForm,
      mediaType: "none",
      mediaUrl: "https://evil.example.com/x.png",
      videoEmbedUrl: "javascript:alert(1)",
    });

    expect(res.success).toBe(true);
    const data = lastWriteData(prismaMock.bulletin.create);
    expect(data.mediaUrl).toBeNull();
    expect(data.videoEmbedUrl).toBeNull();
    expect(JSON.stringify(data)).not.toContain("evil.example.com");
    expect(JSON.stringify(data)).not.toContain("javascript:");
  });

  it("treats a limit of 0 as zero notices, not as no limit", async () => {
    prismaMock.bulletin.findMany.mockResolvedValue([]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    await getPublicBulletins("home", 0);
    // `limit ? … : …` spread `{}` here and returned the whole published
    // archive — on the home page, for a caller that asked for none.
    expect(lastQuery(prismaMock.bulletin.findMany).take).toBe(0);

    // And the fixture path has to agree, or an outage changes the answer.
    makeDatabaseUnreachable();
    expect(await getPublicBulletins("home", 0)).toEqual([]);
  });

  it("breaks a same-day tie on the fixture path, newest id first", async () => {
    // An earlier version of this test re-read the shipped fixture, which has no
    // two notices on one day — so it re-checked the primary sort and could not
    // fail on a broken tiebreaker while claiming to prove one. A same-day pair
    // has to be constructed.
    //
    // Fixture rows derive `createdAt` from the notice date (see
    // `freshBulletins`), so a same-day pair ties on it too and falls through to
    // `id`, descending. That is the documented fixture behaviour; the database
    // breaks the same tie on a real TIMESTAMP(3) instead.
    makeDatabaseUnreachable();
    await withExtraFixtureRow(
      {
        id: "bulletin-003z",
        title: "Same day as bulletin-003, later id",
        content: "Shares 2026-08-10 with bulletin-003 and must sort ahead of it.",
        titleMs: null,
        contentMs: null,
        category: "announcement",
        targetPage: "all",
        mediaType: "none",
        mediaUrl: null,
        videoEmbedUrl: null,
        isPinned: false,
        isPublished: true,
        authorName: "Shelter Team",
        publishedAt: "2026-08-10",
      },
      async () => {
        const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");
        const ids = (await getPublicBulletins("all")).map((b) => b.id);
        expect(ids.indexOf("bulletin-003z")).toBe(ids.indexOf("bulletin-003") - 1);
        // And the answer is the same on every call, which a tie left to sort
        // stability would not guarantee across engines.
        expect((await getPublicBulletins("all")).map((b) => b.id)).toEqual(ids);
      }
    );
  });

  it("presents an unknown category instead of throwing", () => {
    // The admin table indexed the presentation record directly, so a row whose
    // category this build does not carry threw on `.toneClass` and took down
    // the one screen where that row could be repaired.
    const unknown = presentBulletinCategory("not_a_real_category" as never);
    expect(unknown).toBeDefined();
    expect(typeof unknown.toneClass).toBe("string");
    expect(typeof unknown.label).toBe("string");
  });
});

/* -------------------------------------------------------------------------- */
/* Second review round: the fix commit's own defects                          */
/* -------------------------------------------------------------------------- */

describe("corrections from the review of the fixes", () => {
  /**
   * The shape `BulletinRecord` actually carries: `publishedAt` is a calendar
   * day, `createdAt` a full ISO instant. An earlier revision truncated
   * `createdAt` to a day, which made this tiebreaker dead — every row compared
   * equal here while Postgres ordered on TIMESTAMP(3). Tests that supplied ISO
   * values could not see it, because the system did not produce them.
   */
  const row = (
    over: Partial<{ id: string; isPinned: boolean; publishedAt: string; createdAt: string }>
  ) => ({
    id: "x",
    isPinned: false,
    publishedAt: "2026-09-22",
    createdAt: "2026-09-22T09:00:00.000Z",
    ...over,
  });

  it("resolves a same-day tie to the NEWEST notice, not the oldest", () => {
    // The whole point of the tiebreaker. An ascending one is deterministic and
    // wrong: a two-item feed would drop the notice written most recently that
    // day, permanently, which is the failure the tiebreaker was added to stop.
    const sorted = sortBulletinsForFeed([
      row({ id: "a", createdAt: "2026-09-22T09:00:00.000Z" }),
      row({ id: "c", createdAt: "2026-09-22T14:00:00.000Z" }),
      row({ id: "b", createdAt: "2026-09-22T11:00:00.000Z" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
    // The urgent notice posted at 14:00 survives a limit of two.
    expect(sorted.slice(0, 2).map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("puts pinned first, then the newest day, before any tiebreak", () => {
    const sorted = sortBulletinsForFeed([
      row({ id: "old", publishedAt: "2026-09-01" }),
      row({ id: "pinned-old", publishedAt: "2026-08-01", isPinned: true }),
      row({ id: "new", publishedAt: "2026-09-22" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["pinned-old", "new", "old"]);
  });

  it("breaks a full tie on id, descending, so the order is total", () => {
    const same = { publishedAt: "2026-09-22", createdAt: "2026-09-22T09:00:00.000Z" };
    const sorted = sortBulletinsForFeed([row({ id: "a", ...same }), row({ id: "b", ...same })]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("declares every tiebreaker descending in the query too", () => {
    // The in-memory path and the query must answer the same question; a
    // disagreement means an outage silently reorders the feed.
    expect(
      BULLETIN_FEED_ORDER_BY.every((clause) => Object.values(clause)[0] === "desc")
    ).toBe(true);
  });

  it("keeps purging the other paths when one revalidation throws", async () => {
    // Before the fix a single try wrapped the whole loop, so a throw on "/"
    // skipped the rest while the action still reported success. The harness
    // mock cannot fail on its own, so the failure has to be injected or the
    // behaviour is untested and a regression is invisible.
    revalidatePathSpy.mockImplementationOnce(() => {
      throw new Error("revalidate failed for /");
    });
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    const { createBulletinAction } = await import("@/actions/bulletins");

    const res = await createBulletinAction(formInput());

    expect(res.success).toBe(true);
    const purged = getRevalidatedPaths().map((p) => p.path);
    expect(purged).toEqual(
      expect.arrayContaining(["/pets", "/bulletins", "/admin/bulletins"])
    );
  });

  it("accepts every depth the `**.` wildcard allows, and nothing above it", () => {
    // The first fix rewrote hostMatches for `**.` and left `*.` falling through
    // to an exact comparison no hostname can satisfy. Both forms are handled
    // now; this pins the form the list actually carries.
    expect(isAllowedBulletinImageUrl("https://one.supabase.co/x.png")).toBe(true);
    expect(isAllowedBulletinImageUrl("https://a.b.supabase.co/x.png")).toBe(true);
    expect(isAllowedBulletinImageUrl("https://supabase.co/x.png")).toBe(false);
    expect(isAllowedBulletinImageUrl("https://evilsupabase.co/x.png")).toBe(false);
  });

  it("strips the URL of the unselected media type from the parsed output", () => {
    // Not merely ignored: the output type must be unable to carry it, so a
    // future caller writing values.videoEmbedUrl directly cannot ship a
    // javascript: URL into an <iframe src> on three public pages.
    const res = bulletinFormSchema.safeParse(
      formInput({
        mediaType: "none",
        mediaUrl: "https://evil.example.com/x.png",
        videoEmbedUrl: "javascript:alert(1)",
      })
    );
    expect(res.success).toBe(true);
    expect(res.data?.mediaUrl).toBeUndefined();
    expect(res.data?.videoEmbedUrl).toBeUndefined();
    expect(JSON.stringify(res.data)).not.toContain("evil.example.com");
    expect(JSON.stringify(res.data)).not.toContain("javascript:");
  });

  it("keeps the URL that does belong to the selected type", () => {
    const res = bulletinFormSchema.safeParse(
      formInput({ mediaType: "image", mediaUrl: ALLOWED_IMAGE })
    );
    expect(res.success).toBe(true);
    expect(res.data?.mediaUrl).toBe(ALLOWED_IMAGE);
  });

  it("accepts a year below 0100 rather than calling it impossible", () => {
    // Date.UTC maps two-digit years into 1900+, so the round-trip refused every
    // year 0000-0099 with a message that was untrue.
    expect(
      bulletinFormSchema.safeParse(formInput({ publishedAt: "0099-01-01" })).success
    ).toBe(true);
  });

  it("retires the index it once created, so no database is left in drift", () => {
    // Deleting the CREATE is not enough: anyone who ran the previous revision
    // has the index while the schema does not, which check-drift classifies as
    // destructive drift and which blocks `npm run db:push`.
    const sql = readFileSync(
      join(process.cwd(), "prisma/migrations/manual/20260922_community_bulletins/migration.sql"),
      "utf8"
    );
    expect(sql).toContain('DROP INDEX IF EXISTS "bulletins_publishedAt_idx"');
    expect(sql).not.toContain('CREATE INDEX IF NOT EXISTS "bulletins_publishedAt_idx"');
    // The index the model DOES declare must still be created.
    expect(sql).toContain("bulletins_isPublished_targetPage_isPinned_publishedAt_idx");
  });
});

/* -------------------------------------------------------------------------- */
/* Third review round                                                          */
/* -------------------------------------------------------------------------- */

describe("corrections from the third review", () => {
  it("keeps createdAt as a full instant, so the tiebreaker is not dead", async () => {
    // The defect the round-2 fix left behind: truncating createdAt to a day
    // made every row compare equal in memory while Postgres ordered on
    // TIMESTAMP(3) — the two paths could not agree whatever the comments said.
    const { listBulletinRecords } = await import("@/lib/server/bulletinRepository");
    prismaMock.bulletin.findMany.mockResolvedValue([
      dbRow({ id: "b1", createdAt: new Date("2026-09-22T14:30:45.123Z") }),
    ]);

    const [record] = await listBulletinRecords();

    expect(record.createdAt).toBe("2026-09-22T14:30:45.123Z");
    // publishedAt is a notice date and stays a day.
    expect(record.publishedAt).toBe("2026-08-14");
  });

  it("refuses year zero, which Postgres cannot store", () => {
    // Accepting it traded a clear field message for `date/time field value out
    // of range` surfaced as the action's generic failure with nothing named.
    expect(
      bulletinFormSchema.safeParse(formInput({ publishedAt: "0000-01-01" })).success
    ).toBe(false);
    // The years the previous fix was right about still pass.
    expect(
      bulletinFormSchema.safeParse(formInput({ publishedAt: "0001-01-01" })).success
    ).toBe(true);
  });

  it("matches embed hosts exactly, with no wildcard widening", () => {
    // Widening this list was speculative — no rule carries a wildcard — and it
    // gates an <iframe src> on three public pages, where a later one-character
    // slip would admit a subdomain the exact match refuses.
    expect(isAllowedBulletinEmbedUrl("https://www.youtube.com/embed/abc")).toBe(true);
    expect(isAllowedBulletinEmbedUrl("https://evil.www.youtube.com/embed/abc")).toBe(false);
    expect(isAllowedBulletinEmbedUrl("https://a.player.vimeo.com/video/1")).toBe(false);
  });

  it("freezes the host list it ships to the browser", () => {
    // `readonly` is erased at compile time; the comment claimed a runtime
    // guard, so there has to be one.
    expect(Object.isFrozen(BULLETIN_EMBED_HOSTS)).toBe(true);
    expect(() => {
      (BULLETIN_EMBED_HOSTS as string[]).push("evil.example.com");
    }).toThrow();
  });

  it("normalises an unknown category for display, and names it unknown for editing", () => {
    // Two different answers on purpose. Rendering falls back so a row is still
    // readable; editing must NOT, because a silent rewrite is worse than a
    // refusal — the select would otherwise jump to the first option and save
    // "announcement" over whatever the row held.
    expect(normaliseBulletinCategory("not_a_real_category")).toBe("announcement");
    expect(normaliseBulletinCategory("clinic")).toBe("clinic");
    expect(isKnownBulletinCategory("not_a_real_category")).toBe(false);
    expect(isKnownBulletinCategory("clinic")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Fourth review round                                                         */
/* -------------------------------------------------------------------------- */

describe("corrections from the fourth review", () => {
  it("has distinct notice dates, which is what makes the derived instant work", () => {
    // Honest about what this pins and what it cannot.
    //
    // `freshBulletins` derives each fixture row's `createdAt` from its notice
    // date, so the tiebreaker is only live while those dates are distinct. That
    // premise is what this asserts. It does NOT observe the repository's
    // derivation: the fixture path returns `Bulletin`, which carries no
    // `createdAt`, and the admin reader has no fixture fallback, so the value is
    // unreachable through any public API. Add a second notice on an existing
    // date and this test fails — which is the signal to give the fixture
    // explicit instants rather than deriving them.
    //
    // The rule itself is exercised directly against `sortBulletinsForFeed`
    // above, with rows carrying distinct instants on one shared day.
    const dates = (fixtureJson as { publishedAt: string }[]).map((r) => r.publishedAt);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("freezes the lists that decide, not only the one that describes", () => {
    // An earlier revision froze BULLETIN_EMBED_HOSTS — the advisory list used
    // for message text — and left the two that gate the checks mutable, in a
    // module that ships to the browser. The freeze was pointed at the one array
    // where mutation could not change an answer.
    expect(Object.isFrozen(BULLETIN_EMBED_HOSTS)).toBe(true);
    expect(Object.isFrozen(BULLETIN_EMBED_RULES)).toBe(true);
    expect(Object.isFrozen(BULLETIN_IMAGE_HOSTS)).toBe(true);
  });

  it("refuses a notice date decades away, which one slipped digit produces", () => {
    // There is no `publishedAt <= now` predicate and the feed sorts DESC, while
    // `/` and `/pets` show two notices. So 2062 for 2026 publishes at once,
    // sorts above every real notice, and holds a slot for thirty-six years with
    // nothing on screen explaining why newer notices stopped appearing.
    const slipped = `${new Date().getUTCFullYear() + 36}-08-14`;
    const res = bulletinFormSchema.safeParse(formInput({ publishedAt: slipped }));
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path.includes("publishedAt"))).toBe(true);

    // Post-dating is intended, so a plausible future date still passes.
    const soon = `${new Date().getUTCFullYear() + 1}-08-14`;
    expect(bulletinFormSchema.safeParse(formInput({ publishedAt: soon })).success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Fifth review round (whole PR against master)                                */
/* -------------------------------------------------------------------------- */

describe("corrections from the fifth review", () => {
  /** A Prisma-shaped error with a code, as the client throws them. */
  const prismaError = (code: string) =>
    Object.assign(new Error(`prisma ${code}`), { name: "PrismaClientKnownRequestError", code });

  describe("what a failed public read serves, by environment", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("serves NO notices in production when the table exists but the read fails", async () => {
      // The fixture would bring back notices staff deleted and hide everything
      // they posted, and `/` and `/bulletins` are ISR, so that render would be
      // cached as the good page for up to five minutes. And it must be logged:
      // production otherwise swallows it silently.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example/x");
      prismaMock.bulletin.findMany.mockRejectedValue(prismaError("P1001"));
      const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

      expect(await getPublicBulletins("home", 2)).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("serves the launch fixture in production when the table does not exist yet", async () => {
      // P2021 is a deploy that landed before the migration. The fixture is the
      // launch content the migration would seed — what visitors saw before this
      // feature — so serving it is correct, not a resurrection.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example/x");
      prismaMock.bulletin.findMany.mockRejectedValue(prismaError("P2021"));
      const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

      const ids = (await getPublicBulletins("all")).map((b) => b.id);
      expect(ids).toContain("bulletin-001");
    });

    it("does not treat a missing COLUMN as a missing table", async () => {
      // P2022 means the table exists and holds staff content under a drifted
      // schema; the fixture would hide that content.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example/x");
      prismaMock.bulletin.findMany.mockRejectedValue(prismaError("P2022"));
      const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

      expect(await getPublicBulletins("all")).toEqual([]);
    });
  });

  describe("what an editor is told", () => {
    beforeEach(() => {
      sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    });

    it("names the missing migration when the table does not exist", async () => {
      // The likeliest production failure if the code deploys first. A generic
      // "Failed to publish" told the editor nothing about why every save failed.
      prismaMock.bulletin.create.mockRejectedValue(prismaError("P2021"));
      const { createBulletinAction } = await import("@/actions/bulletins");

      const res = await createBulletinAction(formInput());
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not set up on this database/i);
      expect(res.error).toMatch(/20260922_community_bulletins/);
    });

    it("calls a timeout an outage, not a generic failure", async () => {
      // P1008 was one of the codes the old hand-picked list of three missed.
      prismaMock.bulletin.create.mockRejectedValue(prismaError("P1008"));
      const { createBulletinAction } = await import("@/actions/bulletins");

      const res = await createBulletinAction(formInput());
      expect(res.error).toMatch(/database is unavailable/i);
    });

    it.each([
      ["pin", "setBulletinPinnedAction", (a: Record<string, (...x: unknown[]) => unknown>) => a.setBulletinPinnedAction("bulletin-db-1", true)],
      ["publish", "setBulletinPublishedAction", (a: Record<string, (...x: unknown[]) => unknown>) => a.setBulletinPublishedAction("bulletin-db-1", false)],
      ["update", "updateBulletinAction", (a: Record<string, (...x: unknown[]) => unknown>) => a.updateBulletinAction("bulletin-db-1", formInput())],
      ["delete", "deleteBulletinAction", (a: Record<string, (...x: unknown[]) => unknown>) => a.deleteBulletinAction("bulletin-db-1")],
    ])("reports a row deleted mid-%s as gone, not as a failure", async (_l, _n, invoke) => {
      // A check-then-act race: the row vanished between the read and the write.
      // Prisma answers P2025, which used to surface as a generic failure and a
      // logged stack instead of the not-found answer.
      prismaMock.bulletin.update.mockRejectedValue(prismaError("P2025"));
      prismaMock.bulletin.delete.mockRejectedValue(prismaError("P2025"));
      const actions = (await import("@/actions/bulletins")) as unknown as Record<
        string,
        (...x: unknown[]) => unknown
      >;

      const res = (await invoke(actions)) as { success: boolean; error?: string };
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no longer exists/i);
    });
  });

  it("never publishes an editor's email address as the byline", async () => {
    // The byline is rendered on three public, cached, crawlable pages.
    sessionMock.getCurrentSession.mockResolvedValue({ ...CONTENT_EDITOR, name: "   " });
    const { createBulletinAction } = await import("@/actions/bulletins");

    await createBulletinAction(formInput());
    const data = lastWriteData(prismaMock.bulletin.create);
    expect(data.authorName).toBe("Shelter Team");
    expect(JSON.stringify(data)).not.toContain(CONTENT_EDITOR.email);
  });

  it("audits every editable field on an edit, before and after", async () => {
    // It used to log title, category and target page only, so unticking
    // Published in the form, or swapping the embedded video, left no trace.
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    prismaMock.bulletin.findUnique.mockResolvedValue(dbRow({ isPublished: true }));
    const { resetAuditLogs, getAuditLogs } = await import("@/lib/domain/auditLog");
    resetAuditLogs();
    const { updateBulletinAction } = await import("@/actions/bulletins");

    await updateBulletinAction("bulletin-db-1", formInput({ isPublished: false }));

    const entry = getAuditLogs(10).find((e) => e.action === "BULLETIN_UPDATED");
    const details = entry?.details as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(details.before.isPublished).toBe(true);
    expect(details.after.isPublished).toBe(false);
    for (const field of ["content", "videoEmbedUrl", "mediaUrl", "publishedAt", "isPinned"]) {
      expect(details.before).toHaveProperty(field);
      expect(details.after).toHaveProperty(field);
    }
  });

  it("audits the whole notice on a delete", async () => {
    // "A delete is the one change nothing else records" — so the Malay copy and
    // media have to be in the entry, or they are gone for good.
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    // What `delete` RETURNS is what the audit must record — not a row read
    // beforehand, which an edit landing in between would make stale.
    prismaMock.bulletin.delete.mockResolvedValue(
      dbRow({ titleMs: "Notis", videoEmbedUrl: ALLOWED_EMBED, mediaType: "video" })
    );
    const { resetAuditLogs, getAuditLogs } = await import("@/lib/domain/auditLog");
    resetAuditLogs();
    const { deleteBulletinAction } = await import("@/actions/bulletins");

    await deleteBulletinAction("bulletin-db-1");

    const entry = getAuditLogs(10).find((e) => e.action === "BULLETIN_DELETED");
    const details = entry?.details as Record<string, unknown>;
    expect(details.titleMs).toBe("Notis");
    expect(details.videoEmbedUrl).toBe(ALLOWED_EMBED);
    expect(details).toHaveProperty("isPublished");
    expect(details).toHaveProperty("isPinned");
  });

  it("freezes each embed rule, not just the array holding them", () => {
    // Object.freeze is shallow; the rule objects stayed writable in the
    // browser bundle, so `RULES[0].prefix = "/"` widened the client check.
    for (const rule of BULLETIN_EMBED_RULES) {
      expect(Object.isFrozen(rule)).toBe(true);
    }
  });

  it("labels each target with every page it actually appears on", () => {
    // The archive at /bulletins reads with no target filter, so "Home page"
    // promised an exclusivity that did not exist.
    expect(BULLETIN_TARGET_PAGE_LABELS.home).toMatch(/Bulletins page/);
    expect(BULLETIN_TARGET_PAGE_LABELS.pets).toMatch(/Bulletins page/);
    expect(BULLETIN_TARGET_PAGE_LABELS.bulletins).toMatch(/only/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Sixth review round                                                          */
/* -------------------------------------------------------------------------- */

describe("corrections from the sixth review", () => {
  const prismaError = (code: string) =>
    Object.assign(new Error(`prisma ${code}`), { name: "PrismaClientKnownRequestError", code });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads 'today' in the shelter's zone, not UTC", () => {
    // 17:00 UTC on the 13th is 01:00 on the 14th in Kuala Lumpur. A UTC
    // reading says the 13th and would hide a notice an overnight volunteer
    // dated today for up to eight hours. Fixed instants, so swapping the zone
    // or reading UTC fails here — the scheduling test computes its dates with
    // shelterToday itself and could not tell.
    expect(shelterToday(new Date("2026-10-13T17:00:00.000Z"))).toBe("2026-10-14");
    expect(shelterToday(new Date("2026-10-13T15:59:00.000Z"))).toBe("2026-10-13");
  });

  it("bounds the feed at the start of the shelter's tomorrow, exclusively", async () => {
    // `< tomorrow's midnight`, not `<= today's`: the column defaults to now(),
    // so a row inserted other than through the form carries a time of day and
    // `<= midnight` hid it until the next day while the admin badge called it
    // live. Pinned to an exact instant.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T17:00:00.000Z")); // the 14th in KL
    prismaMock.bulletin.findMany.mockResolvedValue([]);
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    await getPublicBulletins("all");
    const where = lastQuery(prismaMock.bulletin.findMany).where as {
      publishedAt: { lt: Date };
    };
    expect(where.publishedAt.lt.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("gives the badge and the query's bound the same answer for a mid-day row", () => {
    // Narrow on purpose: this checks the two FUNCTIONS agree — the one the
    // admin badge calls and the one the query's `lt` is built from. That the
    // query actually uses `startOfNextShelterDay` is pinned by the exact-instant
    // test above, which is what fails if the read goes back to `lte` midnight.
    // The badge's answer for a row whose stored instant is mid-morning today.
    const now = new Date("2026-10-14T03:00:00.000Z"); // 11:00 in KL
    expect(isScheduledForLater("2026-10-14T05:00:00.000Z", shelterToday(now))).toBe(false);
    expect(startOfNextShelterDay(now) > new Date("2026-10-14T05:00:00.000Z")).toBe(true);
  });

  it("serves the fixture when no database is configured at all, even in production", async () => {
    // With no DATABASE_URL the fixture is the only data there is. Asking
    // NODE_ENV instead made a production build with no database prerender an
    // empty feed and log an error for every page.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    prismaMock.bulletin.findMany.mockRejectedValue(prismaError("P1001"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    const ids = (await getPublicBulletins("all")).map((b) => b.id);
    expect(ids).toContain("bulletin-001");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs when production serves the fixture because the table is missing", async () => {
    // The likeliest production failure (deployed before the migration) was the
    // one path that left no trace: production swallows the read error, and
    // this branch skipped the log.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example/x");
    prismaMock.bulletin.findMany.mockRejectedValue(prismaError("P2021"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    await getPublicBulletins("all");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/does not exist yet/));
    warnSpy.mockRestore();
  });

  it("does not send an editor to the table migration for a missing column", async () => {
    // Re-running that migration only creates what is absent; it cannot add a
    // column, so naming it for P2022 points at the wrong fix.
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    prismaMock.bulletin.create.mockRejectedValue(prismaError("P2022"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createBulletinAction } = await import("@/actions/bulletins");

    const res = await createBulletinAction(formInput());
    expect(res.error).toMatch(/out of date/i);
    expect(res.error).not.toMatch(/20260922_community_bulletins/);
    errorSpy.mockRestore();
  });

  it("deletes in one round trip, auditing the row the delete returned", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    prismaMock.bulletin.delete.mockResolvedValue(
      dbRow({ id: "bulletin-db-1", title: "The row delete returned" })
    );
    const { resetAuditLogs, getAuditLogs } = await import("@/lib/domain/auditLog");
    resetAuditLogs();
    const { deleteBulletinAction } = await import("@/actions/bulletins");

    const res = await deleteBulletinAction("bulletin-db-1");

    // It succeeded — a returned row read as falsy would answer "no longer exists".
    expect(res.success).toBe(true);
    expect(prismaMock.bulletin.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.bulletin.delete).toHaveBeenCalledTimes(1);
    // And the audit carries what was actually deleted, not a row read earlier.
    const entry = getAuditLogs(10).find((e) => e.action === "BULLETIN_DELETED");
    // Asserted first, so a delete that stops auditing fails as a readable
    // expectation rather than a TypeError reading `.title` of undefined.
    expect(entry).toBeDefined();
    expect(entry?.details).toMatchObject({ title: "The row delete returned" });
  });

  it("warns once that the table is missing, not on every request", async () => {
    // `/pets` is force-dynamic: a per-request warning would log on every visit
    // until the migration ran, burying everything else in the logs.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example/x");
    prismaMock.bulletin.findMany.mockRejectedValue(prismaError("P2021"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");

    await getPublicBulletins("pets", 2);
    await getPublicBulletins("pets", 2);
    await getPublicBulletins("all");
    const tableWarnings = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("does not exist yet")
    );
    expect(tableWarnings).toHaveLength(1);
    warnSpy.mockRestore();
  });
});

describe("corrections from the ninth and tenth reviews", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides a future-dated notice on the fallback path, judging one day per pass", async () => {
    // 16:30 UTC on the 11th is the 12th in Kuala Lumpur. So bulletin-002
    // (dated the 12th) is live only if the day is the shelter's — a UTC day
    // would hide it — and bulletin-001 (the 14th) is scheduled either way.
    // Dropping, inverting or de-zoning the date check serves the wrong set.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-11T16:30:00.000Z"));
    const schedule = await import("@/lib/domain/bulletinSchedule");
    const today = vi.mocked(schedule.shelterToday);
    prismaMock.bulletin.findMany.mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getPublicBulletins } = await import("@/lib/server/bulletinRepository");
    today.mockClear();

    const ids = (await getPublicBulletins("all")).map((b) => b.id);
    // Exactly these, in feed order: the pinned notice first, then newest.
    expect(ids).toEqual(["bulletin-002", "bulletin-003", "bulletin-004"]);
    // And "today" was asked once for the pass, not once per row: per row, a
    // pass crossing the shelter's midnight judges rows against different days.
    // A clock cannot be made to cross midnight mid-pass, so the call count is
    // the observable stand-in. It counts only calls through the export, which
    // the repository makes; `startOfNextShelterDay` calls its module-local copy.
    expect(today).toHaveBeenCalledTimes(1);
  });
});
