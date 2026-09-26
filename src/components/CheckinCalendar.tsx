import { monthGrid } from "@/lib/dates";
import { DAILY_GOAL } from "@contracts/quest";

/**
 * 打卡日历三态着色：
 * 0 题空白 / 1–(DAILY_GOAL-1) 题浅色（部分完成）/ ≥DAILY_GOAL 题实心（完成每日目标）
 */
export default function CheckinCalendar({
  month,
  activity,
  today,
}: {
  month: string;
  activity: Record<string, number>;
  today: string;
}) {
  const cells = monthGrid(month);
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
        <div key={w} className="py-1 text-muted-foreground">
          {w}
        </div>
      ))}
      {cells.map((c, i) => {
        if (c === null) return <div key={i} />;
        const n = activity[c] ?? 0;
        const cls =
          n >= DAILY_GOAL
            ? "bg-primary text-primary-foreground font-semibold"
            : n > 0
              ? "bg-primary/25 text-foreground font-medium"
              : "text-muted-foreground";
        const ring = c === today ? "ring-2 ring-inset ring-primary/50" : "";
        return (
          <div
            key={i}
            className={`aspect-square flex items-center justify-center rounded-md tabular-nums ${cls} ${ring}`}
          >
            {Number(c.slice(-2))}
          </div>
        );
      })}
    </div>
  );
}
