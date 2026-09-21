import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

type Status = "verifying" | "success" | "error";

/**
 * 邮箱确认落地页（注册邮件里的链接指向这里）。
 * 用 token_hash 完成激活 → 显示"验证成功" → 2 秒后自动跳登录页。
 */
export default function AuthConfirm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") ?? "signup";
  const [status, setStatus] = useState<Status>(tokenHash ? "verifying" : "error");
  const [countdown, setCountdown] = useState(2);
  // StrictMode 会双跑 effect，用这个 ref 保证 verifyOtp 只调一次
  const tried = useRef(false);

  const siteUrl = window.location.origin + import.meta.env.BASE_URL;

  useEffect(() => {
    if (tried.current) return;
    if (!tokenHash) return; // 无 token 时初始状态就是 error
    tried.current = true;
    let mounted = true;
    (async () => {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        // 邮件模板传过来的是 signup；其余类型原样透传
        type: type as "signup",
      });
      if (!mounted) return;
      if (error) {
        setStatus("error");
        return;
      }
      // 激活完成后不保留登录态，让学生到登录页手动登录
      await supabase.auth.signOut();
      if (!mounted) return;
      setStatus("success");
    })();
    return () => {
      mounted = false;
    };
  }, [tokenHash, type]);

  useEffect(() => {
    if (status !== "success") return;
    if (countdown <= 0) {
      navigate("/login");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown, navigate]);

  const title =
    status === "verifying"
      ? "Подтверждаем email…"
      : status === "success"
        ? "Email подтверждён!"
        : "Ссылка недействительна";

  const description =
    status === "verifying"
      ? "Пожалуйста, не закрывайте страницу."
      : status === "success"
        ? `Ваш аккаунт активирован. Сейчас вы будете перенаправлены на страницу входа${
            countdown > 0 ? ` (через ${countdown} сек)` : "…"
          }. Если этого не произошло, откройте сайт в браузере вручную:`
        : "Ссылка недействительна или устарела. Вернитесь на страницу входа и попробуйте войти — при необходимости зарегистрируйтесь заново.";

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
          <h2 className="text-lg font-semibold">{title}</h2>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "success" && (
            <a
              href={siteUrl}
              className="block text-sm text-accent underline break-all"
            >
              {siteUrl}
            </a>
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
