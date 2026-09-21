import { useState, type ReactNode } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { fetchLevelReport, fetchRangeReport } from "@/lib/data/reports";
import { addDays } from "@/lib/quest/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayStr } from "@/lib/dates";
import {
  downloadRangeReport,
  downloadLevelReport,
} from "@/lib/pdf";
import { Download, FileText } from "lucide-react";

export default function Reports() {
  const { user } = useAuth();
  const email = user?.email ?? "";

  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [weekDay, setWeekDay] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка при создании PDF");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-1">Отчёты для учителя</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Скачайте PDF и отправьте Ли Лаоши. В отчёте есть иероглифы, пиньинь и перевод ошибок.
      </p>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <ReportCard
          title="Отчёт за день"
          desc="Задания, точность и ошибки за выбранный день"
        >
          <div className="space-y-1.5">
            <Label>День</Label>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <PdfButton
            busy={busy === "day"}
            onClick={() =>
              run("day", async () => {
                const d = await fetchRangeReport(day, day);
                await downloadRangeReport("Отчёт за день", d, email, `hanyu-quest_day_${day}.pdf`);
              })
            }
          />
        </ReportCard>

        <ReportCard
          title="Отчёт за период"
          desc="Произвольный диапазон дат"
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>С</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>По</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <PdfButton
            busy={busy === "range"}
            onClick={() =>
              run("range", async () => {
                const d = await fetchRangeReport(from, to);
                await downloadRangeReport("Отчёт за период", d, email, `hanyu-quest_${from}_${to}.pdf`);
              })
            }
          />
        </ReportCard>

        <ReportCard
          title="Отчёт за неделю"
          desc="Выберите любой день нужной недели (пн–вс)"
        >
          <div className="space-y-1.5">
            <Label>День недели</Label>
            <Input type="date" value={weekDay} onChange={(e) => setWeekDay(e.target.value)} />
          </div>
          <PdfButton
            busy={busy === "week"}
            onClick={() =>
              run("week", async () => {
                const monday = mondayOf(weekDay);
                const d = await fetchRangeReport(monday, addDays(monday, 6));
                await downloadRangeReport("Отчёт за неделю", d, email, `hanyu-quest_week_${monday}.pdf`);
              })
            }
          />
        </ReportCard>

        <ReportCard
          title="Отчёт за месяц"
          desc="Вся статистика выбранного месяца"
        >
          <div className="space-y-1.5">
            <Label>Месяц</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <PdfButton
            busy={busy === "month"}
            onClick={() =>
              run("month", async () => {
                const d = await fetchRangeReport(`${month}-01`, lastDayOfMonth(month));
                await downloadRangeReport("Отчёт за месяц", d, email, `hanyu-quest_month_${month}.pdf`);
              })
            }
          />
        </ReportCard>

        <ReportCard
          title="Отчёт по словарю"
          desc="Уровни запоминания всех слов, списки изученных и новых"
          wide
        >
          <PdfButton
            busy={busy === "level"}
            onClick={() =>
              run("level", async () => {
                const d = await fetchLevelReport();
                await downloadLevelReport(d, email, `hanyu-quest_vocabulary.pdf`);
              })
            }
          />
        </ReportCard>
      </div>
    </Layout>
  );
}

function ReportCard({
  title,
  desc,
  wide,
  children,
}: {
  title: string;
  desc: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl bg-card border p-5 shadow-sm flex flex-col gap-3 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <FileText className="w-4.5 h-4.5" />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function PdfButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={busy} className="gap-2 self-start">
      <Download className="w-4 h-4" />
      {busy ? "Создаю PDF…" : "Скачать PDF"}
    </Button>
  );
}

/** 该日期所在周的周一 */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 该月最后一天 YYYY-MM-DD */
function lastDayOfMonth(monthStr: string): string {
  const d = new Date(`${monthStr}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
