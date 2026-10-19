import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({ getCurrentUserAction: vi.fn(), loginAction: vi.fn() }));

vi.mock("@/actions/auth", () => ({
  getCurrentUserAction: actions.getCurrentUserAction,
  loginAction: actions.loginAction,
  registerAction: vi.fn(),
  logoutAction: vi.fn(),
}));

import { enterAdminConsole, useAdminAuth } from "@/lib/client/adminAuth";

const STORAGE_KEY = "hope_for_strays_admin_session";
const CACHED = { id: "usr-staff-01", email: "staff@hopeforstrays.org", name: "Cached Staff", role: "STAFF" };

/**
 * Whether the console believes anyone is signed in.
 *
 * When the server answered "nobody" — an expired cookie, a suspension, a deleted account —
 * the hook fell back to the user cached in localStorage, so the console and its tabs stayed
 * on screen over sections that all refused the visitor. The first case fails against that.
 */
describe("useAdminAuth", () => {
  beforeEach(() => {
    actions.getCurrentUserAction.mockReset();
    actions.loginAction.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops a cached user the server no longer recognises", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHED));
    actions.getCurrentUserAction.mockResolvedValue({ user: null });

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("takes the server's member over the cached one", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHED));
    const live = { ...CACHED, name: "Live Staff", role: "VOLUNTEER_COORDINATOR", expiresAt: 1 };
    actions.getCurrentUserAction.mockResolvedValue({ user: live });

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(live);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(live);
  });

  it("keeps the cached user when the server cannot be reached", async () => {
    // A thrown call is not an answer: nothing says the session ended.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHED));
    actions.getCurrentUserAction.mockRejectedValue(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(CACHED);
  });

  it("caches the member a sign-in returns, as the console's fallback", async () => {
    // If the console's first session check fails, this copy is what it shows; it must be
    // the person who just signed in, not whoever this browser held before.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHED));
    actions.getCurrentUserAction.mockResolvedValue({ user: null });
    const newMember = { ...CACHED, id: "usr-new", name: "New Member", email: "new@hopeforstrays.org" };
    actions.loginAction.mockResolvedValue({ success: true, user: newMember });
    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.login(newMember.email, "a-long-enough-password");

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(newMember);
  });

  it("keeps that copy when entering the console", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHED));
    // jsdom implements no navigation and reports the attempt on console.error.
    vi.spyOn(console, "error").mockImplementation(() => {});

    enterAdminConsole();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(CACHED);
  });

  it("forgets the cached user when the caller cannot say who signed in", () => {
    // Invitation acceptance learns no role, so the previous person on a shared browser
    // would otherwise be the fallback.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHED));
    vi.spyOn(console, "error").mockImplementation(() => {});

    enterAdminConsole({ forgetCachedUser: true });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
