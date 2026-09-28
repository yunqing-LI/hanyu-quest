import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

type Status = "verifying" | "ready" | "success" | "error";

/**
 * 重置密码落地页。用户点重置邮件链接后带着 #access_token=...&type=recovery
 * 回到本站：main.tsx 记下标记 → App 跳到这里。supabase-js 消费 hash 后
 * 触发 PASSWORD_RECOVERY 事件并建立恢复会话，有了会话才能 updateUser 改密。
 * 改完即退出登录、跳登录页（不保留恢复会话）。
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    let mounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && mounted) setStatus("ready");
    });
    // 会话已在（如落地后刷新页面重进）也直接放行
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setStatus("ready");
    });
    // 超时仍未拿到恢复会话，视为链接失效或已被使用
    const t = setTimeout(() => {
      if (mounted) setStatus((s) => (s === "verifying" ? "error" : s));
    }, 8000);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (status !== "success") return;
    if (countdown <= 0) {
      navigate("/login");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError("Пароли не совпадают.");
      return;
    }
    setPending(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (err) {
      setError(
        "Не удалось сохранить пароль. Ссылка могла устареть — вернитесь на страницу входа и запросите новую.",
      );
      return;
    }
    // 不保留恢复会话，让学生用新密码手动登录
    await supabase.auth.signOut();
    setStatus("success");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <span className="seal font-hanzi flex items-center justify-center w-14 h-14 text-3xl font-bold">
          汉
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ханьюй-квест</h1>
          <p className="text-sm text-muted-foreground italic">
            китайский с Ли Лаоши
          </p>
        </div>
      </div>

      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-4">
          <h2 className="text-lg font-semibold">
            {status === "verifying" && "Проверяем ссылку…"}
            {status === "ready" && "Новый пароль"}
            {status === "success" && "Пароль обновлён!"}
            {status === "error" && "Ссылка недействительна"}
          </h2>
          <CardDescription>
            {status === "verifying" && "Пожалуйста, не закрывайте страницу."}
            {status === "ready" &&
              "Придумайте новый пароль для входа в аккаунт."}
            {status === "success" &&
              `Сейчас вы будете перенаправлены на страницу входа${
                countdown > 0 ? ` (через ${countdown} сек)` : "…"
              }. Войдите с новым паролем.`}
            {status === "error" &&
              "Ссылка недействительна или устарела. Вернитесь на страницу входа и запросите новую."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Новый пароль</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repeat-password">Повторите пароль</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  minLength={6}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  placeholder="Ещё раз тот же пароль"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={pending}
              >
                {pending ? "Подождите…" : "Сохранить пароль"}
              </Button>
            </form>
          )}
          {status === "error" && (
            <Button className="w-full" onClick={() => navigate("/login")}>
              Ко входу
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
