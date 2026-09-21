import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/query-client";
import { isDeveloperEmail } from "@contracts/developer";
import { LOGIN_PATH } from "@/const";

export interface AuthUser {
  email: string;
  name: string;
  role: "admin" | "user";
}

function toAuthUser(u: SupabaseUser): AuthUser {
  const metaName = (u.user_metadata as { name?: string } | undefined)?.name;
  const email = u.email ?? "";
  return {
    email,
    name: metaName || email.split("@")[0] || "—",
    role: isDeveloperEmail(email) ? "admin" : "user",
  };
}

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err);
        setSession(data.session);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user: AuthUser | null = session?.user ? toAuthUser(session.user) : null;

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate(redirectPath);
  }, [navigate, redirectPath]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && !session) {
      const currentPath = window.location.hash.replace(/^#/, "") || "/";
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, session, navigate, redirectPath]);

  const refresh = useCallback(async () => {
    await supabase.auth.refreshSession();
  }, []);

  return useMemo(
    () => ({
      user,
      isAuthenticated: !!session,
      isLoading,
      error,
      logout,
      refresh,
    }),
    [user, session, isLoading, error, logout, refresh],
  );
}
