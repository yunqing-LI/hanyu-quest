import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/query-client";
import { LOGIN_PATH } from "@/const";

export interface AuthUser {
  email: string;
  name: string;
  role: "admin" | "user";
}

function toAuthUser(u: SupabaseUser, role: "admin" | "user"): AuthUser {
  const metaName = (u.user_metadata as { name?: string } | undefined)?.name;
  const email = u.email ?? "";
  return {
    email,
    name: metaName || email.split("@")[0] || "—",
    role,
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
  /** 角色查询结果，带 userId 标签防止串号（A 退出后 B 登录不会短暂继承 A 的角色） */
  const [roleInfo, setRoleInfo] = useState<{
    id: string;
    role: "admin" | "user";
  } | null>(null);

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

  // 角色判定走数据库（developer_emails 表 + is_developer() 函数），
  // 仓库代码里不再硬编码教师邮箱
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.rpc("is_developer");
        if (mounted)
          setRoleInfo({ id: userId, role: data === true ? "admin" : "user" });
      } catch {
        if (mounted) setRoleInfo({ id: userId, role: "user" });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const role: "admin" | "user" =
    userId && roleInfo?.id === userId ? roleInfo.role : "user";
  const isRoleLoading = !!userId && roleInfo?.id !== userId;

  const user: AuthUser | null = session?.user
    ? toAuthUser(session.user, role)
    : null;

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
      isRoleLoading,
      error,
      logout,
      refresh,
    }),
    [user, session, isLoading, isRoleLoading, error, logout, refresh],
  );
}
