import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/query-client";
import { INVITE_CODE } from "@contracts/invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

/** 把 Supabase 的英文报错翻译成用户能看懂的俄语提示 */
function friendlyError(message: string): string {
  if (/email not confirmed/i.test(message)) {
    return "Email ещё не подтверждён. Проверьте почту и перейдите по ссылке из письма, затем войдите снова.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "Неверный email или пароль.";
  }
  if (/already registered|already been registered/i.test(message)) {
    return "Этот email уже зарегистрирован. Попробуйте войти.";
  }
  if (/password should be at least/i.test(message)) {
    return "Пароль должен быть не короче 6 символов.";
  }
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** 注册成功且需邮箱验证时显示的提示页 */
  const [registered, setRegistered] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "register") {
      // 班级邀请码校验：只挡路人，不是安全机制
      if (invite.trim() !== INVITE_CODE) {
        setError("Неверный код приглашения");
        return;
      }
      setPending(true);
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || undefined },
          // 确认邮件的落地地址，必须显式带上 base 子路径
          // （GitHub Pages 项目站点是 用户名.github.io/仓库名/），
          // 否则 Supabase 用后台 Site URL，少子路径会落到 GitHub 404。
          // 该地址需加入 Supabase 后台 Authentication → URL Configuration → Redirect URLs。
          emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      });
      setPending(false);
      if (err) {
        setError(friendlyError(err.message));
        return;
      }
      if (data.session) {
        // 后台未开邮箱验证时直接登录成功
        queryClient.clear();
        navigate("/");
      } else {
        setRegistered(true);
      }
      return;
    }

    setPending(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(false);
    if (err) {
      setError(friendlyError(err.message));
      return;
    }
    queryClient.clear();
    navigate("/");
  };

  if (registered) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <Card className="w-full max-w-sm shadow-md">
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold">Проверьте почту и подтвердите email</h2>
            <CardDescription>
              Мы отправили письмо на {email}. Перейдите по ссылке в письме —
              только после этого можно войти.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setRegistered(false);
                setMode("login");
              }}
            >
              Ко входу
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-secondary">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`py-1.5 rounded-md text-sm transition-colors ${
                  mode === m
                    ? "bg-card font-semibold shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
          <CardDescription className="pt-3">
            {mode === "login"
              ? "Войдите, чтобы продолжить ежедневную тренировку"
              : "Создайте аккаунт: прогресс сохраняется в облаке"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Имя (необязательно)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Как к вам обращаться"
                  autoComplete="nickname"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="invite">Код приглашения</Label>
                <Input
                  id="invite"
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="Спросите код у учителя"
                  autoComplete="off"
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              {pending
                ? "Подождите…"
                : mode === "login"
                  ? "Войти"
                  : "Зарегистрироваться"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        每天 30 题 · 打卡闯关 · 把报告发给老师
      </p>
    </div>
  );
}
