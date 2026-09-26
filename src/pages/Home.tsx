import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import CheckinCalendar from "@/components/CheckinCalendar";
import { fetchCalendarActivity, fetchDashboard } from "@/lib/data/practice";
import { Button } from "@/components/ui/button";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { todayStr, currentMonthStr, ruMonthName } from "@/lib/dates";
import { BADGE_META, DAILY_GOAL, type BadgeCode } from "@contracts/quest";
import { Flame, Play, CheckCircle2, BookOpen, GraduationCap, CalendarCheck } from "lucide-react";

export default function Home() {
  const today = todayStr();
  const month = currentMonthStr();
  const dash = useQuery({ queryKey: ["dashboard", today], queryFn: () => fetchDashboard(today) });
  const cal = useQuery({ queryKey: ["calendar", month], queryFn: () => fetchCalendarActivity(month) });

  const d = dash.data;
  const activity = cal.data ?? {};
  const answeredToday = activity[today] ?? 0;
  const todayDone = answeredToday >= DAILY_GOAL;

  return (
    <Layout>
      {/* 主横幅：连续天数 + 今日任务 */}
      <section className="rounded-2xl bg-card border p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">
              {d?.doneToday ? "Задание на сегодня выполнено!" : "Ваше задание на сегодня"}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              {Math.min(d?.answeredToday ?? 0, DAILY_GOAL)}
              <span className="text-muted-foreground font-normal"> / {DAILY_GOAL} заданий</span>
            </h1>
            <ProgressBar
              value={Math.min(((d?.answeredToday ?? 0) / DAILY_GOAL) * 100, 100)}
              className="h-3 mb-4"
            />
            <div className="flex flex-wrap items-center gap-3">
              {d?.doneToday ? (
                <div className="flex items-center gap-2 text-accent font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Молодец! Возвращайтесь завтра
                </div>
              ) : (
                <Button asChild size="lg" className="gap-2">
                  <Link to="/practice">
                    <Play className="w-4 h-4" />
                    {d && d.answeredToday > 0 ? "Продолжить" : "Начать тренировку"}
                  </Link>
                </Button>
              )}
              {d && d.answeredToday > 0 && (
                <span className="text-sm text-muted-foreground">
                  Точность сегодня:{" "}
                  {d.answeredToday > 0
                    ? Math.round((d.correctToday / d.answeredToday) * 100)
                    : 0}
                  %
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 md:gap-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-primary">
                <Flame className="w-8 h-8" fill="currentColor" />
                <span className="text-5xl font-bold tabular-nums">{d?.streak ?? 0}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {plural(d?.streak ?? 0, "день", "дня", "дней")} подряд
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 数据卡片 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Stat
          icon={<BookOpen className="w-4 h-4" />}
          label="К повторению"
          value={d?.dueCount ?? "…"}
        />
        <Stat
          icon={<GraduationCap className="w-4 h-4" />}
          label="Изучается слов"
          value={d?.seenWords ?? "…"}
        />
        <Stat
          icon={<CalendarCheck className="w-4 h-4" />}
          label="Всего в словаре"
          value={d?.totalWords ?? "…"}
        />
        <Stat
          icon={<Flame className="w-4 h-4" />}
          label="Выучено (ур. 4–5)"
          value={
            d?.levelDistribution
              ?.filter((l) => l.level >= 4)
              .reduce((s, l) => s + Number(l.n), 0) ?? "…"
          }
        />
      </section>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {/* 打卡日历 */}
        <section className="rounded-2xl bg-card border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Календарь занятий</h2>
            <span className="text-sm text-muted-foreground">{ruMonthName(month)}</span>
          </div>
          <CheckinCalendar month={month} activity={activity} today={today} />
          <p className="text-xs text-muted-foreground mt-3">
            {todayDone
              ? "Сегодня отмечено ✓"
              : answeredToday > 0
                ? `Сегодня: ${answeredToday} из ${DAILY_GOAL} заданий`
                : `Выполните ${DAILY_GOAL} заданий, чтобы отметить сегодняшний день`}
          </p>
        </section>

        {/* 徽章 */}
        <section className="rounded-2xl bg-card border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Достижения</h2>
            <Button asChild variant="link" size="sm" className="text-primary">
              <Link to="/progress">Весь прогресс →</Link>
            </Button>
          </div>
          <ul className="space-y-2.5">
            {(Object.keys(BADGE_META) as BadgeCode[]).map((code) => {
              const earned = d?.badges?.find((b) => b.badgeCode === code);
              const meta = BADGE_META[code];
              return (
                <li key={code} className="flex items-center gap-3">
                  <span
                    className={`text-xl w-9 h-9 flex items-center justify-center rounded-full ${
                      earned ? "bg-secondary" : "bg-muted opacity-40 grayscale"
                    }`}
                  >
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${earned ? "" : "text-muted-foreground"}`}>
                      {meta.ru}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{meta.desc}</p>
                  </div>
                  {earned && <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Layout>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-card border p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
