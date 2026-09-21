import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { Button } from "@/components/ui/button";
import { LogOut, Flame } from "lucide-react";
import { useEffect } from "react";

const NAV = [
  { to: "/", label: "Главная" },
  { to: "/practice", label: "Тренировка" },
  { to: "/progress", label: "Прогресс" },
  { to: "/reports", label: "Отчёты" },
];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 select-none">
      <span className="seal font-hanzi flex items-center justify-center w-9 h-9 text-lg font-bold">
        汉
      </span>
      <span className="leading-tight">
        <span className="block font-bold text-[15px] tracking-tight">
          Ханьюй-квест
        </span>
        {!compact && (
          <span className="block text-[11px] text-muted-foreground italic">
            китайский с Ли Лаоши
          </span>
        )}
      </span>
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate(LOGIN_PATH);
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Brand />
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-accent font-medium hover:bg-secondary"
                  }`
                }
              >
                Учителю
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-xs text-muted-foreground max-w-[160px] truncate">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={logout} title="Выйти">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* 移动端导航 */}
        <nav className="md:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `px-3 py-1 rounded-md text-sm whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              className="px-3 py-1 rounded-md text-sm text-accent font-medium whitespace-nowrap"
            >
              Учителю
            </NavLink>
          )}
        </nav>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>

      <footer className="border-t py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-primary" />
            Ханьюй-квест — каждый день по 30 заданий
          </span>
          <span className="italic">китайский с Ли Лаоши</span>
        </div>
      </footer>
    </div>
  );
}
