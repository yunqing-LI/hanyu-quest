import type {
  ExerciseItemRow,
  ExerciseSessionRow,
} from "@contracts/types";
import { supabase, myUserId } from "@/lib/supabase";
import { mapWord } from "./words";
import { buildLevelReport, buildRangeReport } from "@/lib/quest/report";
import type { LevelReportData, RangeReportData } from "@/lib/pdf";

function must(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** 拉取一份日期范围内的全部原始数据，再在本地聚合（原 reports 路由逻辑；只取本人数据） */
async function fetchRangeData(from: string, to: string) {
  const uid = await myUserId();
  const { data: sessionRows, error: sErr } = await supabase
    .from("exercise_sessions")
    .select("*")
    .eq("user_id", uid)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  must(sErr);
  const sessions = (sessionRows ?? []) as ExerciseSessionRow[];

  const sessionIds = sessions.map((s) => s.id);
  let items: ExerciseItemRow[] = [];
  if (sessionIds.length > 0) {
    const { data: itemRows, error: iErr } = await supabase
      .from("exercise_items")
      .select("*")
      .in("session_id", sessionIds);
    must(iErr);
    items = (itemRows ?? []) as ExerciseItemRow[];
  }

  const { data: checkinRows, error: cErr } = await supabase
    .from("checkins")
    .select("date")
    .eq("user_id", uid)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  must(cErr);
  const checkinDates = (checkinRows ?? []).map((r) => r.date as string);

  const { data: wordRows, error: wErr } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: true });
  must(wErr);
  const words = (wordRows ?? []).map((r) => mapWord(r));

  return { sessions, items, checkinDates, words };
}

/** 日期范围聚合报告（日/区间/周/月共用） */
export async function fetchRangeReport(
  from: string,
  to: string,
): Promise<RangeReportData> {
  const { sessions, items, checkinDates, words } = await fetchRangeData(from, to);
  return buildRangeReport(
    sessions.map((s) => ({
      id: s.id,
      date: s.date,
      total: s.total,
      correct: s.correct,
      durationSec: s.duration_sec,
    })),
    items.map((i) => ({
      sessionId: i.session_id,
      wordId: i.word_id,
      result: i.result,
    })),
    words,
    checkinDates,
    from,
    to,
  );
}

/** 当前级别报告：词表总掌握进度（只看本人） */
export async function fetchLevelReport(): Promise<LevelReportData> {
  const uid = await myUserId();
  const { data: wordRows, error: wErr } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: true });
  must(wErr);
  const { data: progressRows, error: pErr } = await supabase
    .from("user_word_progress")
    .select("*")
    .eq("user_id", uid);
  must(pErr);

  return buildLevelReport(
    (wordRows ?? []).map((r) => mapWord(r)),
    (progressRows ?? []).map((p) => ({
      wordId: p.word_id as number,
      level: p.level as number,
      correctCount: p.correct_count as number,
      wrongCount: p.wrong_count as number,
    })),
  );
}
