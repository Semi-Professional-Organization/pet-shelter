import { beforeEach, vi } from "vitest";

/**
 * Centralized Next.js 16 App Router test harness.
 *
 * Loaded through `setupFiles` in `vitest.config.mts`, so every suite gets the
 * same `next/headers`, `next/cache`, and `next/navigation` doubles plus a
 * hermetic reset of every module-level cache in `src/lib`.
 *
 * A test file that declares its own `vi.mock("next/headers", ...)` still wins
 * for that file — Vitest gives a file's own registration precedence over a
 * setup file's. Five suites predating this harness do exactly that; they keep
 * working untouched, and the accessors exported here simply observe nothing for
 * them.
 */

// ---------------------------------------------------------------------------
// next/headers
// ---------------------------------------------------------------------------

/** A cookie as the App Router's `RequestCookie` exposes it, plus its options. */
export interface MockCookie {
  name: string;
  value: string;
  [option: string]: unknown;
}

const cookieJar = new Map<string, MockCookie>();
const requestHeaders = new Headers();

/**
 * Next 16 accepts `set(name, value, options)` and `set({ name, value, ...options })`
 * interchangeably, and real call sites in `src/actions` use both. Normalizing
 * here is what lets one harness serve them all — a mock implementing only the
 * tuple form fails silently on the object form by storing `undefined`.
 */
function normalizeCookieInput(
  nameOrCookie: string | MockCookie,
  value?: string,
  options?: Record<string, unknown>
): MockCookie {
  if (typeof nameOrCookie === "string") {
    return { ...(options ?? {}), name: nameOrCookie, value: value ?? "" };
  }
  return { ...nameOrCookie };
}

export interface MockCookieStore {
  get(name: string): MockCookie | undefined;
  getAll(name?: string): MockCookie[];
  has(name: string): boolean;
  set(
    nameOrCookie: string | MockCookie,
    value?: string,
    options?: Record<string, unknown>
  ): MockCookieStore;
  delete(
    nameOrCookie: string | { name: string; [option: string]: unknown }
  ): MockCookieStore;
  clear(): void;
  seed(name: string, value: string, options?: Record<string, unknown>): void;
}

export const mockCookieStore: MockCookieStore = {
  get(name: string): MockCookie | undefined {
    return cookieJar.get(name);
  },

  getAll(name?: string): MockCookie[] {
    const all = Array.from(cookieJar.values());
    return name ? all.filter((c) => c.name === name) : all;
  },

  has(name: string): boolean {
    return cookieJar.has(name);
  },

  set(
    nameOrCookie: string | MockCookie,
    value?: string,
    options?: Record<string, unknown>
  ): typeof mockCookieStore {
    const cookie = normalizeCookieInput(nameOrCookie, value, options);
    // `maxAge: 0` is how the logout path expires a cookie rather than calling
    // `.delete()`. Treating that as an ordinary write would leave a live session
    // in the jar and let a logout test pass while the real cookie was cleared.
    if (cookie.maxAge === 0 || cookie.expires === 0) {
      cookieJar.delete(cookie.name);
    } else {
      cookieJar.set(cookie.name, cookie);
    }
    return mockCookieStore;
  },

  delete(
    nameOrCookie: string | { name: string; [option: string]: unknown }
  ): typeof mockCookieStore {
    const name = typeof nameOrCookie === "string" ? nameOrCookie : nameOrCookie.name;
    cookieJar.delete(name);
    return mockCookieStore;
  },

  clear(): void {
    cookieJar.clear();
  },

  /** Seeds a cookie without going through `set`, for arranging a signed session. */
  seed(name: string, value: string, options: Record<string, unknown> = {}): void {
    cookieJar.set(name, { ...options, name, value });
  },
};

/** The `Headers` instance the mocked `headers()` returns, for arranging request headers. */
export function mockRequestHeaders(): Headers {
  return requestHeaders;
}

vi.mock("next/headers", () => ({
  // Async since Next 15. Awaiting a non-promise works, so a synchronous mock
  // would hide a missing `await` in production code; a real promise does not.
  cookies: vi.fn(async () => mockCookieStore),
  headers: vi.fn(async () => requestHeaders),
  draftMode: vi.fn(async () => ({ isEnabled: false, enable: vi.fn(), disable: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// next/cache
// ---------------------------------------------------------------------------

/** Next 16's `revalidateTag` takes a required cacheLife profile alongside the tag. */
type CacheLifeProfile = string | { expire?: number };

const revalidatedPaths: Array<{ path: string; type?: "page" | "layout" }> = [];
const revalidatedTags: string[] = [];
const revalidatedTagCalls: Array<{ tag: string; profile?: CacheLifeProfile }> = [];

/** Every `revalidatePath()` call since the last reset, in order. */
export function getRevalidatedPaths(): Array<{ path: string; type?: "page" | "layout" }> {
  return [...revalidatedPaths];
}

/** Every `revalidateTag()` and `updateTag()` call since the last reset, in order. */
export function getRevalidatedTags(): string[] {
  return [...revalidatedTags];
}

/** The same calls with their cacheLife profile, for assertions that care about it. */
export function getRevalidatedTagCalls(): Array<{ tag: string; profile?: CacheLifeProfile }> {
  return [...revalidatedTagCalls];
}

export const revalidatePathSpy = vi.fn((path: string, type?: "page" | "layout") => {
  revalidatedPaths.push({ path, type });
});

export const revalidateTagSpy = vi.fn((tag: string, profile?: CacheLifeProfile) => {
  revalidatedTags.push(tag);
  revalidatedTagCalls.push({ tag, profile });
});

export const updateTagSpy = vi.fn((tag: string) => {
  revalidatedTags.push(tag);
  revalidatedTagCalls.push({ tag });
});

export const refreshSpy = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
  revalidateTag: revalidateTagSpy,
  // Next 16 split cache invalidation across three entry points; a suite that
  // exercises an action using `updateTag` would otherwise hit the unmocked
  // module and fail outside a request scope.
  updateTag: updateTagSpy,
  refresh: refreshSpy,
  unstable_cache: <T>(fn: T) => fn,
}));

// ---------------------------------------------------------------------------
// next/navigation
// ---------------------------------------------------------------------------

/**
 * Mirrors the control-flow contract of the real `redirect()` and `notFound()`:
 * both throw, so code after the call is unreachable. A mock that merely records
 * would let a test walk through a branch the framework never executes.
 */
export class MockNavigationError extends Error {
  constructor(
    readonly digest: string,
    readonly target?: string
  ) {
    super(digest);
    this.name = "MockNavigationError";
  }
}

let lastRedirect: string | null = null;

/** The most recent `redirect()` target since the last reset, or `null`. */
export function getLastRedirect(): string | null {
  return lastRedirect;
}

export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

let currentPathname = "/";
let currentSearchParams = new URLSearchParams();

/** Points `usePathname()` and `useSearchParams()` at a URL for the next render. */
export function setMockLocation(pathname: string, search = ""): void {
  currentPathname = pathname;
  currentSearchParams = new URLSearchParams(search);
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    lastRedirect = url;
    throw new MockNavigationError("NEXT_REDIRECT", url);
  }),
  permanentRedirect: vi.fn((url: string) => {
    lastRedirect = url;
    throw new MockNavigationError("NEXT_REDIRECT", url);
  }),
  notFound: vi.fn(() => {
    throw new MockNavigationError("NEXT_NOT_FOUND");
  }),
  useRouter: () => routerMock,
  usePathname: () => currentPathname,
  useSearchParams: () => currentSearchParams,
  useParams: () => ({}),
}));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Clears everything this harness records, without touching `src/lib` state. */
export function resetNextMocks(): void {
  cookieJar.clear();
  for (const key of Array.from(requestHeaders.keys())) {
    requestHeaders.delete(key);
  }

  revalidatedPaths.length = 0;
  revalidatedTags.length = 0;
  revalidatedTagCalls.length = 0;
  revalidatePathSpy.mockClear();
  revalidateTagSpy.mockClear();
  updateTagSpy.mockClear();
  refreshSpy.mockClear();

  lastRedirect = null;
  Object.values(routerMock).forEach((fn) => fn.mockClear());

  currentPathname = "/";
  currentSearchParams = new URLSearchParams();
}

/**
 * One hermetic reset before every test in the whole suite.
 *
 * Registered here rather than per-file so a new suite is isolated by default
 * instead of by remembering to opt in. Setup-file hooks run ahead of a test
 * file's own `beforeEach`, so a suite that arranges fixtures in its own hook
 * still gets a clean store first and then layers its arrangement on top.
 *
 * The `src/lib` stores are imported *dynamically, inside the hook*, and that is
 * load-bearing rather than stylistic. A setup file is evaluated before the test
 * file, so a static `import { resetServerStore } from "@/lib/server/fallbackState"`
 * would instantiate the repositories — and through them the real `@/lib/prisma` —
 * before the test file's own `vi.mock("@/lib/server/prisma", ...)` is registered. Suites
 * that spy on the Prisma client would then assert against a client the code
 * under test is not using, and silently observe zero calls. Deferring the
 * import to hook-execution time lets each file's mocks win.
 */
beforeEach(async () => {
  resetNextMocks();

  const [
    fallbackState,
    userStore,
    auditLog,
    rateLimit,
    idempotency,
    donationLedger,
    donationPledgeLedger,
    sponsorshipLedger,
    sponsorRepository,
    sponsorDemoSeed,
    notificationPreferences,
  ] = await Promise.all([
    import("@/lib/server/fallbackState"),
    import("@/lib/server/userStore"),
    import("@/lib/domain/auditLog"),
    import("@/lib/security/rateLimit"),
    import("@/lib/security/idempotency"),
    import("@/lib/server/donationLedger"),
    import("@/lib/server/donationPledgeLedger"),
    import("@/lib/server/sponsorshipLedger"),
    import("@/lib/server/sponsorRepository"),
    import("@/lib/server/sponsorDemoSeed"),
    import("@/lib/server/notificationPreferences"),
  ]);

  fallbackState.resetServerStore();
  auditLog.resetAuditLogs();
  rateLimit.resetRateLimitStore();
  idempotency.resetIdempotencyStore();
  donationLedger.resetDonationLedger();
  donationPledgeLedger.resetDonationPledgeLedger();
  sponsorshipLedger.resetSponsorshipLedger();
  // Order matters: clearing the demo-seed flag after the ledger is emptied is what lets
  // the next suite re-seed. Leaving the flag set would give every test after the first an
  // empty ledger and no standings.
  sponsorDemoSeed.resetSponsorDemoSeed();
  await sponsorRepository.resetSponsorRepository();
  notificationPreferences.resetNotificationPreferences();
  await userStore.resetUserStore();
});
