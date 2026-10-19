"use client";

import { useState, useEffect, useCallback } from "react";
import { loginAction, registerAction, logoutAction, getCurrentUserAction } from "@/actions/auth";
import type { Role } from "@/lib/security/permissions";

const AUTH_STORAGE_KEY = "hope_for_strays_admin_session";

export interface AdminUser {
  id?: string;
  email: string;
  name: string;
  /** May be a deprecated alias when read from a cached localStorage session. */
  role: Role | string;
}

/**
 * Opens the console after a session was created outside the admin layout's own
 * hook: sign-in, registration, invitation acceptance.
 *
 * A full document load, never `router.push`. `src/app/admin/layout.tsx` also wraps
 * /admin/login and /admin/invite, mounts there while signed out, and an App Router
 * layout persists across client-side navigation, so its `useAdminAuth` instance kept
 * the signed-out verdict: it blanked the next page and pushed straight back to
 * /admin/login. A new document mounts the layout with the new cookie. /admin then
 * redirects to the first section the member's live role opens.
 *
 * The browser's cached user is what the console falls back on if its first session
 * check fails, so it must describe the new session. `login` and `register` have just
 * written it; a caller that cannot (invitation acceptance learns no role) passes
 * `forgetCachedUser`, or the previous person on a shared browser would be the
 * fallback.
 */
export function enterAdminConsole({ forgetCachedUser = false }: { forgetCachedUser?: boolean } = {}): void {
  if (forgetCachedUser) {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Storage blocked (private mode): there is no cached copy to mislead anyone.
    }
  }
  // The rule's advice, useRouter().push(), is exactly the navigation the layout bounced.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/admin");
}

function cacheUser(user: AdminUser): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage blocked (private mode): the console simply has no fallback.
  }
}

export function useAdminAuth() {
  const [user, setUser] = useState<AdminUser | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.error("Auth session parse error", e);
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(true);

  // Synchronize with server session on mount
  useEffect(() => {
    let mounted = true;
    async function syncSession() {
      try {
        const res = await getCurrentUserAction();
        if (mounted) {
          if (res.user) {
            setUser(res.user);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
          } else {
            // The server's "nobody" is final: an expired cookie, a suspension, a deleted
            // account. This used to fall back to the cached user, which kept the console
            // and its tabs on screen over sections that all refused the visitor.
            setUser(null);
            localStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
      } catch (e) {
        // A thrown call (network, a Server Action id gone stale after a deploy) is not
        // an answer, so the cached user stays rather than signing a member out on a
        // blip. Each section still gates on the server, so a stale tab costs a 403
        // page whose "Back to Admin" lands correctly, not access.
        //
        // ceiling: on that path the name and tabs come from the last answer this
        // browser cached, which a role change since then makes stale. The upgrade is
        // to hand the layout the verified session from a server component instead of
        // asking for it from the client.
        console.error("Error syncing session:", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    syncSession();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(
    async (
      email: string,
      pass: string
    ): Promise<{ success: boolean; error?: string; retryAfterSeconds?: number }> => {
      try {
        const result = await loginAction({ email, password: pass });
        if (result.success && result.user) {
          // The console's fallback if its first session check fails, so it must be
          // this member. Not set as this instance's state: every caller leaves through
          // `enterAdminConsole`, which unloads it.
          cacheUser(result.user);
          return { success: true };
        }
        return {
          success: false,
          error: result.error || "Invalid credentials",
          retryAfterSeconds: result.retryAfterSeconds,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Authentication failed";
        return { success: false, error: msg };
      }
    },
    []
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      role?: Role;
      staffInviteCode?: string;
    }): Promise<{ success: boolean; error?: string; retryAfterSeconds?: number }> => {
      try {
        const result = await registerAction(data);
        if (result.success && result.user) {
          // As in `login`.
          cacheUser(result.user);
          return { success: true };
        }
        return {
          success: false,
          error: result.error || "Registration failed",
          retryAfterSeconds: result.retryAfterSeconds,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Registration failed";
        return { success: false, error: msg };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await logoutAction();
    } catch (e) {
      console.error("Logout error", e);
    }
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      document.cookie = `hope_admin_token=; path=/; max-age=0; SameSite=Lax`;
    }
  }, []);

  // No normalised `role` is offered here. It existed to fold a deprecated alias
  // before UI gating read it, and that fold is what gated a VOLUNTEER as STAFF:
  // gate on `user.role` through `roleHasPermission`, which resolves the aliases
  // (and an old lowercase value) itself and fails closed on VOLUNTEER.
  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };
}
