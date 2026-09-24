import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // 本地开发忘配 .env 时尽早给出可读提示（构建产物部署后不会出现此分支）
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in the values from your Supabase project.",
  );
}

// 全站唯一的 Supabase client（Auth + Postgres 都走它，会话存 localStorage）
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * 当前登录用户 id（未登录则抛错）。
 * 所有「本人数据」查询都必须显式按它过滤：RLS 策略对开发者放行全表
 * （user_id = auth.uid() or is_developer()），只靠 RLS 会把别人的数据混进来。
 */
export async function myUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Не удалось определить пользователя");
  return data.user.id;
}
