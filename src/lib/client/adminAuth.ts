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
 */
export function enterAdminConsole(): void {
  // The rule's advice, useRouter().push(), is exactly the navigation the layout bounced.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/admin");
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
          setUser(result.user);
          if (typeof window !== "undefined") {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
          }
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
          setUser(result.user);
          if (typeof window !== "undefined") {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
          }
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
