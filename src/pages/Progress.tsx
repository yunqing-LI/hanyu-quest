import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { fetchCalendar, fetchDashboard } from "@/lib/data/practice";
import { Button } from "@/components/ui/button";
import {
  todayStr,
  currentMonthStr,
  monthGrid,
  ruMonthName,
  shiftMonth,
  formatRuDate,
} from "@/lib/dates";
import { BADGE_META, type BadgeCode } from "@contracts/quest";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";

const LEVEL_LABELS = ["Новые", "Уровень 1", "Уровень 2", "Уровень 3", "Уровень 4", "Уровень 5"];
const LEVEL_COLORS = [
  "bg-muted",
  "bg-destructive/60",
  "bg-primary/50",
  "bg-primary/70",
  "bg-accent/70",
  "bg-accent",
];

export default function Progress() {
  const today = todayStr();
  const [month, setMonth] = useState(currentMonthStr());
  const dash = useQuery({ queryKey: ["dashboard", today], queryFn: () => fetchDashboard(today) });
  const cal = useQuery({ queryKey: ["calendar", month], queryFn: () => fetchCalendar(month) });

  const checked = new Set(cal.data ?? []);
  const cells = monthGrid(month);
  const dist = dash.data?.levelDistribution ?? [];
  const maxCount = Math.max(1, ...dist.map((l) => Number(l.n)));
  const earned = new Map(
    (dash.data?.badges ?? []).map((b) => [b.badgeCode, b.earnedAt]),
  );

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-5">Мой прогресс</h1>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 日历 */}
        <section className="rounded-2xl bg-card border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold">{ruMonthName(month)}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= currentMonthStr()}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
              <div key={w} className="py-1 text-muted-foreground">{w}</div>
            ))}
            {cells.map((c, i) =>
              c === null ? (
                <div key={i} />
              ) : (
                <div
                  key={i}
                  className={`aspect-square flex items-center justify-center rounded-md tabular-nums ${
                    checked.has(c)
                      ? "bg-primary text-primary-foreground font-semibold"
                      : c === today
                        ? "border-2 border-primary/50"
                        : "text-muted-foreground"
                  }`}
                >
                  {Number(c.slice(-2))}
                </div>
              ),
            )}
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <Flame className="w-4 h-4 text-primary" fill="currentColor" />
            <span>
              Серия: <b>{dash.data?.streak ?? 0}</b>{" "}
              {(dash.data?.streak ?? 0) === 1 ? "день" : "дней"} подряд
            </span>
          </div>
        </section>

        {/* 掌握度分布 */}
        <section className="rounded-2xl bg-card border p-5 shadow-sm">
          <h2 className="font-semibold mb-1">Уровни запоминания</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Слово растёт в уровне, когда вы отвечаете верно: 1 день → 3 → 7 → 15 → 30
          </p>
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((lv) => {
              const count = Number(dist.find((d) => d.level === lv)?.n ?? 0);
              return (
                <div key={lv} className="flex items-center gap-3">
                  <span className="text-xs w-20 text-muted-foreground">
                    {LEVEL_LABELS[lv]}
                  </span>
                  <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full ${LEVEL_COLORS[lv]} transition-all`}
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Изучается {dash.data?.seenWords ?? 0} из {dash.data?.totalWords ?? 0} слов
          </p>
        </section>
      </div>

      {/* 徽章墙 */}
      <section className="rounded-2xl bg-card border p-5 shadow-sm mt-4">
        <h2 className="font-semibold mb-4">Достижения</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {(Object.keys(BADGE_META) as BadgeCode[]).map((code) => {
            const meta = BADGE_META[code];
            const got = earned.get(code);
            return (
              <div
                key={code}
                className={`rounded-xl border p-4 text-center ${
                  got ? "bg-secondary/60" : "opacity-45 grayscale"
                }`}
              >
                <div className="text-3xl mb-1.5">{meta.icon}</div>
                <p className="text-sm font-medium leading-tight">{meta.ru}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                  {meta.desc}
                </p>
                {got && (
                  <p className="text-[11px] text-accent mt-1.5">
                    {formatRuDate(new Date(got).toISOString().slice(0, 10))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </Layout>
  );
}
