"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/utils/logger";
import { POST_LOGOUT_MESSAGE_KEY } from "@/lib/auth/login-error-messages";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<{ success: boolean; error?: string }>;
  logout: (options?: { redirectQuery?: string }) => Promise<void>;
  isAdmin: boolean;
  isDeveloper: boolean;
  isViewer: boolean;
  canAccessManagement: boolean;
  canAccessAlerts: boolean;
  queryEditorEnabled: boolean;
  sessionExpiresAt: Date | null;
}

// Only real user input counts as "activity" — a passive display refresh (or
// background polling elsewhere in the app, e.g. GlobalHeader's alert check)
// must not extend the idle deadline, or an open-but-untouched tab would never
// idle out. Throttled client-side so a burst of mouse movement doesn't spam
// the server; POST /api/auth/activity is the only endpoint allowed to write
// lastActivityAt (see session-store.ts).
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "scroll", "touchstart"] as const;
const ACTIVITY_RESYNC_THROTTLE_MS = 60_000;

// How often an authenticated tab re-checks whether its own session is still
// the live one for this account. Single-session-per-account (see
// session-store.ts's createSession()) means a login elsewhere revokes this
// tab's session out from under it with no push notification — polling is the
// only way this tab finds out before its next real API call 401s.
const SESSION_REVOCATION_POLL_MS = 20_000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [queryEditorEnabled, setQueryEditorEnabled] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null);
  const router = useRouter();
  const lastActivitySyncRef = useRef(0);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session");
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setQueryEditorEnabled(data.queryEditorEnabled ?? true);
        setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt) : null);
      } else {
        setUser(null);
        setSessionExpiresAt(null);
      }
    } catch (error) {
      logger.error("Failed to check session:", error);
      setUser(null);
      setSessionExpiresAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // session check
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Re-fetches via /api/auth/session (rather than just setUser(data.user))
        // so sessionExpiresAt is populated immediately — login's own response
        // doesn't carry it.
        await checkSession();
        return { success: true };
      } else {
        return { success: false, error: data.error || "Login failed." };
      }
    } catch (error) {
      logger.error("Login error:", error);
      return { success: false, error: "An error occurred during login." };
    }
  }, [checkSession]);

  const register = useCallback(async (name: string, email: string, password: string, confirmPassword: string) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        await checkSession();
        return { success: true };
      } else {
        return { success: false, error: data.error || "Registration failed. Please try again." };
      }
    } catch (error) {
      logger.error("Register error:", error);
      return { success: false, error: "An error occurred during registration." };
    }
  }, [checkSession]);

  const logout = useCallback(async (options?: { redirectQuery?: string }) => {
    const { redirectQuery } = options ?? {};
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setSessionExpiresAt(null);

      const data = await response.json().catch(() => null);
      if (data?.ssoLogoutUrl) {
        // A full navigation, not a client-side route push: the browser has to
        // actually visit the IdP to end that session too — including for an
        // idle-timeout logout. Skipping this here would leave the IdP-side
        // session alive, so anyone at an unattended browser could click "SSO
        // sign-in" again and be silently re-authenticated with no credential
        // prompt, defeating the point of idle timeout in the first place.
        //
        // post_logout_redirect_uri (see the API route) must be the exact,
        // pre-registered value with no query string — some providers fall
        // back to their own portal page otherwise — so redirectQuery can't ride along
        // on that URL. Stash it in sessionStorage instead; LoginForm picks
        // it up once we're actually back on our own origin.
        if (redirectQuery) {
          sessionStorage.setItem(POST_LOGOUT_MESSAGE_KEY, redirectQuery);
        }
        window.location.href = data.ssoLogoutUrl;
        return;
      }

      router.push(redirectQuery ? `/login?${redirectQuery}` : "/login");
    } catch (error) {
      logger.error("Logout error:", error);
    }
  }, [router]);

  const pingActivity = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/activity", { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt) : null);
      }
    } catch (error) {
      logger.error("Failed to record activity:", error);
    }
  }, []);

  // Only real user input resyncs the deadline (see ACTIVITY_EVENTS comment
  // above) — deliberately calls the dedicated activity endpoint, not
  // checkSession()/`/api/auth/session`, which must stay read-only so nothing
  // else that happens to hit it (background polls, other tabs) can
  // masquerade as activity.
  useEffect(() => {
    if (!user) {
      return;
    }

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivitySyncRef.current < ACTIVITY_RESYNC_THROTTLE_MS) {
        return;
      }
      lastActivitySyncRef.current = now;
      pingActivity();
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [user, pingActivity]);

  // Client-side enforcement of the deadline the server already computed —
  // the real cutoff is server-side (the session row itself is revoked by
  // getSessionUser()'s idle check), this just proactively logs the UI out at
  // the right moment instead of waiting for the next API call to 401.
  useEffect(() => {
    if (!sessionExpiresAt) {
      return;
    }

    const checkExpiry = () => {
      if (Date.now() >= sessionExpiresAt.getTime()) {
        // Also ends the IdP session (see logout()'s comment) — idle timeout
        // exists specifically to protect an unattended browser, so leaving
        // SSO logged in there would defeat it.
        logout({ redirectQuery: "error=idle_timeout" });
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [sessionExpiresAt, logout]);

  // Detects a login elsewhere superseding this tab's session (single-session-
  // per-account, see createSession() in session-store.ts). Deliberately
  // narrow: only reacts to reason === "superseded" from GET /api/auth/session
  // — idle timeout already has the precise, self-timed handler above, and an
  // ordinary logout is always self-initiated, so neither needs this poll.
  // Does NOT call logout(): that would also end the IdP session (see
  // logout()'s own comment), which would be wrong here — a newer session for
  // this same account is already live elsewhere, and killing the IdP session
  // out from under it would be an unwanted side effect of a tab that lost the
  // race, not a real logout.
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const checkRevocation = async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (cancelled || response.ok) {
          return;
        }
        const data = await response.json().catch(() => null);
        if (data?.reason !== "superseded") {
          return;
        }
        cancelled = true;
        setUser(null);
        setSessionExpiresAt(null);
        window.alert("다른 기기 또는 브라우저에서 로그인되어 현재 세션이 종료되었습니다.");
        router.push("/login?error=session_revoked");
      } catch (error) {
        logger.error("Failed to check session revocation:", error);
      }
    };

    const interval = setInterval(checkRevocation, SESSION_REVOCATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, router]);

  const isAdmin = useMemo(() => user?.role === "admin", [user?.role]);
  const isDeveloper = useMemo(() => user?.role === "developer", [user?.role]);
  const isViewer = useMemo(() => user?.role === "viewer", [user?.role]);

  // only admin can access the Management page
  const canAccessManagement = useMemo(() => user?.role === "admin", [user?.role]);

  // only admin and developer can access the Alerts page
  const canAccessAlerts = useMemo(
    () => user?.role === "admin" || user?.role === "developer",
    [user?.role]
  );

  const contextValue = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    isAdmin,
    isDeveloper,
    isViewer,
    canAccessManagement,
    canAccessAlerts,
    queryEditorEnabled,
    sessionExpiresAt,
  }), [user, loading, login, register, logout, isAdmin, isDeveloper, isViewer, canAccessManagement, canAccessAlerts, queryEditorEnabled, sessionExpiresAt]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
