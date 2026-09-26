import {
  AnswerResults,
  DAILY_GOAL,
  MASTERED_LEVEL,
  type AnswerResult,
  type ExerciseType,
} from "@contracts/quest";
import type {
  BadgeRow,
  ExerciseSessionRow,
  UserWordProgressRow,
} from "@contracts/types";
import { supabase, myUserId } from "@/lib/supabase";
import { shiftMonth } from "@/lib/dates";
import { mapWord } from "./words";
import { buildDailyItems, pickDailyWords } from "@/lib/quest/session";
import {
  badgeCandidates,
  computeStreak,
  countMastered,
  nextDueDate,
  nextLevel,
} from "@/lib/quest/srs";
import type {
  DashboardData,
  ExerciseItem,
  FinishResult,
  Word,
  WordProgress,
} from "@/lib/quest/types";

function must(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function mapProgress(r: UserWordProgressRow): WordProgress {
  return {
    wordId: r.word_id,
    level: r.level,
    nextDueDate: r.next_due_date,
    correctCount: r.correct_count,
    wrongCount: r.wrong_count,
    lastResult: r.last_result,
  };
}

async function fetchProgressRows(): Promise<UserWordProgressRow[]> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("user_word_progress")
    .select("*")
    .eq("user_id", uid);
  must(error);
  return (data ?? []) as UserWordProgressRow[];
}

async function fetchSessionRow(
  sessionId: number,
): Promise<ExerciseSessionRow | null> {
  const { data, error } = await supabase
    .from("exercise_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  must(error);
  return (data as ExerciseSessionRow | null) ?? null;
}

async function fetchCheckinDates(): Promise<string[]> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("checkins")
    .select("date")
    .eq("user_id", uid)
    .order("date", { ascending: true });
  must(error);
  return (data ?? []).map((r) => r.date as string);
}

/** 打卡（幂等：同日重复靠唯一约束 + upsert 忽略；user_id 显式传，不依赖列默认值） */
async function checkin(today: string): Promise<void> {
  const uid = await myUserId();
  const { error } = await supabase
    .from("checkins")
    .upsert({ user_id: uid, date: today }, { onConflict: "user_id,date" });
  must(error);
}

// ─── 首页仪表盘（原 practice.dashboard） ─────────────────────────────────────

export async function fetchDashboard(today: string): Promise<DashboardData> {
  const uid = await myUserId();
  const [progress, checkinDates, badgeRows, wordsRes, sessions] =
    await Promise.all([
      fetchProgressRows(),
      fetchCheckinDates(),
      supabase.from("badges").select("badge_code, earned_at").eq("user_id", uid),
      supabase
        .from("words")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("exercise_sessions")
        .select("total, correct, completed_at")
        .eq("user_id", uid)
        .eq("date", today),
    ]);
  must(badgeRows.error);
  must(wordsRes.error);
  must(sessions.error);

  const todaySessions = (sessions.data ?? []) as {
    total: number;
    correct: number;
    completed_at: string | null;
  }[];
  const answeredToday = todaySessions.reduce((s, x) => s + x.total, 0);
  const correctToday = todaySessions.reduce((s, x) => s + x.correct, 0);
  const doneToday = answeredToday >= DAILY_GOAL;

  // 自愈：当天已答满 DAILY_GOAL 但缺打卡（此前写库失败/旧逻辑中途退出）→ 进首页时自动补卡
  if (doneToday && !checkinDates.includes(today)) {
    await checkin(today);
    checkinDates.push(today);
  }

  const levelDistMap = new Map<number, number>();
  let dueCount = 0;
  for (const p of progress) {
    // 已掌握（level>=4）的词不再计入「待复习」，与 pickDailyWords 的排除保持一致
    if (p.next_due_date <= today && p.level < MASTERED_LEVEL) dueCount++;
    levelDistMap.set(p.level, (levelDistMap.get(p.level) ?? 0) + 1);
  }

  return {
    goal: DAILY_GOAL,
    answeredToday,
    correctToday,
    doneToday,
    dueCount,
    totalWords: wordsRes.count ?? 0,
    seenWords: progress.length,
    levelDistribution: [0, 1, 2, 3, 4, 5].map((level) => ({
      level,
      n: levelDistMap.get(level) ?? 0,
    })),
    streak: computeStreak(checkinDates, today),
    badges: ((badgeRows.data ?? []) as Pick<BadgeRow, "badge_code" | "earned_at">[]).map(
      (b) => ({ badgeCode: b.badge_code, earnedAt: b.earned_at }),
    ),
  };
}

// ─── 打卡日历（三态：0 题空白 / 1–(DAILY_GOAL-1) 浅色 / ≥DAILY_GOAL 实心） ────

/** 返回该月每天答题数（按 exercise_sessions 聚合），无记录的日子不出现 */
export async function fetchCalendarActivity(
  month: string,
): Promise<Record<string, number>> {
  const uid = await myUserId();
  // 月份过滤必须用 gte/lt 范围：PostgREST 不支持在 date 列上用 like（400: date ~~ unknown）
  const { data, error } = await supabase
    .from("exercise_sessions")
    .select("date, total")
    .eq("user_id", uid)
    .gte("date", `${month}-01`)
    .lt("date", `${shiftMonth(month, 1)}-01`);
  must(error);
  const byDate: Record<string, number> = {};
  for (const r of data ?? []) {
    const date = r.date as string;
    byDate[date] = (byDate[date] ?? 0) + (r.total as number);
  }
  return byDate;
}

// ─── 开始每日练习（原 practice.startDaily） ──────────────────────────────────

export type StartDailyResult =
  | { empty: true; reason: "no_words" | "all_done"; sessionId: 0; items: [] }
  | { empty: false; sessionId: number; items: ExerciseItem[] };

export async function startDaily(input: {
  today: string;
}): Promise<StartDailyResult> {
  const today = input.today;
  const { data: wordRows, error: wErr } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: true });
  must(wErr);
  const allWords: Word[] = (wordRows ?? []).map((r) => mapWord(r));
  const progress = (await fetchProgressRows()).map(mapProgress);

  const picked = pickDailyWords(allWords, progress, today);
  if (picked.length === 0) {
    // 词库为空 vs 词都学过且今天没有到期复习，是两种不同的空态
    return {
      empty: true,
      reason: allWords.length === 0 ? "no_words" : "all_done",
      sessionId: 0,
      items: [],
    };
  }

  const { data: session, error: sErr } = await supabase
    .from("exercise_sessions")
    .insert({ date: today })
    .select("id")
    .single();
  must(sErr);
  if (!session) throw new Error("Failed to create session");

  const items = buildDailyItems(allWords, picked);
  return { empty: false, sessionId: session.id as number, items };
}

// ─── 提交一题答案（原 practice.submitAnswer） ────────────────────────────────

export async function submitAnswer(input: {
  sessionId: number;
  wordId: number;
  exerciseType: ExerciseType;
  result: AnswerResult;
  today: string;
}): Promise<{ ok: true; newLevel: number; answeredToday: number }> {
  const session = await fetchSessionRow(input.sessionId);
  if (!session) throw new Error("Session not found");

  const good =
    input.result === AnswerResults.Correct ||
    input.result === AnswerResults.Known;

  const { error: iErr } = await supabase.from("exercise_items").insert({
    session_id: input.sessionId,
    word_id: input.wordId,
    exercise_type: input.exerciseType,
    result: input.result,
  });
  must(iErr);

  const { error: sErr } = await supabase
    .from("exercise_sessions")
    .update({
      total: session.total + 1,
      correct: session.correct + (good ? 1 : 0),
    })
    .eq("id", input.sessionId);
  must(sErr);

  // SRS 进度：存在则更新，不存在则插入（upsert 语义与原逻辑一致）
  // 必须显式按本人 user_id 过滤：RLS 对开发者放行全表，不带过滤时
  // maybeSingle 可能命中别人的行（多人同学一个词时会直接报错，进度永远写不进去）
  const uid = await myUserId();
  const { data: existing, error: pErr } = await supabase
    .from("user_word_progress")
    .select("*")
    .eq("user_id", uid)
    .eq("word_id", input.wordId)
    .maybeSingle();
  must(pErr);

  const cur = (existing as UserWordProgressRow | null) ?? null;
  const newLevel = nextLevel(cur?.level ?? 0, input.result);
  const due = nextDueDate(input.today, newLevel);

  if (cur) {
    const { error } = await supabase
      .from("user_word_progress")
      .update({
        level: newLevel,
        next_due_date: due,
        correct_count: cur.correct_count + (good ? 1 : 0),
        wrong_count: cur.wrong_count + (good ? 0 : 1),
        last_result: input.result,
      })
      .eq("id", cur.id);
    must(error);
  } else {
    const { error } = await supabase.from("user_word_progress").insert({
      word_id: input.wordId,
      level: newLevel,
      next_due_date: due,
      correct_count: good ? 1 : 0,
      wrong_count: good ? 0 : 1,
      last_result: input.result,
    });
    must(error);
  }

  // 今日累计答题数（跨场次）。答满 DAILY_GOAL 立即打卡，不再等到
  // 整个队列做完——中途退出/分多次练习/页面刷新都不再丢当天打卡
  const { data: todayRows, error: tErr } = await supabase
    .from("exercise_sessions")
    .select("total")
    .eq("user_id", uid)
    .eq("date", input.today);
  must(tErr);
  const answeredToday = (todayRows ?? []).reduce(
    (s, r) => s + (r.total as number),
    0,
  );
  if (answeredToday >= DAILY_GOAL) {
    await checkin(input.today);
  }

  return { ok: true, newLevel, answeredToday };
}

// ─── 完成今日练习：计时、打卡、发徽章（原 practice.finishSession） ──────────

export async function finishSession(input: {
  sessionId: number;
  durationSec: number;
  today: string;
}): Promise<FinishResult> {
  const session = await fetchSessionRow(input.sessionId);
  if (!session) throw new Error("Session not found");

  const uid = await myUserId();
  const { error: sErr } = await supabase
    .from("exercise_sessions")
    .update({
      completed_at: new Date().toISOString(),
      duration_sec: input.durationSec,
    })
    .eq("id", input.sessionId);
  must(sErr);

  // 打卡（一般在答满 DAILY_GOAL 时已由 submitAnswer 触发，这里兜底幂等）
  await checkin(input.today);

  // 徽章评估
  const [checkinDates, progress, badgeRows, answersRes] = await Promise.all([
    fetchCheckinDates(),
    fetchProgressRows(),
    supabase.from("badges").select("badge_code").eq("user_id", uid),
    supabase
      .from("exercise_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid),
  ]);
  must(badgeRows.error);
  must(answersRes.error);

  const streak = computeStreak(checkinDates, input.today);
  const mastered = countMastered(progress.map(mapProgress));
  const earned = new Set((badgeRows.data ?? []).map((b) => b.badge_code));
  const candidates = badgeCandidates({
    firstDaily: true,
    streak,
    masteredCount: mastered,
    answersCount: answersRes.count ?? 0,
  });

  const newBadges: string[] = [];
  for (const code of candidates) {
    if (earned.has(code)) continue;
    const { error } = await supabase
      .from("badges")
      .insert({ badge_code: code });
    if (!error) newBadges.push(code);
  }

  return {
    total: session.total,
    correct: session.correct,
    accuracy:
      session.total > 0
        ? Math.round((session.correct / session.total) * 100)
        : 0,
    streak,
    newBadges,
  };
}

// ─── 播放单词录音（原 practice.getAudio） ────────────────────────────────────

export async function fetchAudio(
  wordId: number,
): Promise<{ mime: string; base64: string } | null> {
  const { data, error } = await supabase
    .from("word_audio")
    .select("audio_base64, mime")
    .eq("word_id", wordId)
    .maybeSingle();
  must(error);
  if (!data) return null;
  return { mime: data.mime as string, base64: data.audio_base64 as string };
}

// 供 React Query 缓存键使用
export const practiceKeys = {
  dashboard: (today: string) => ["dashboard", today] as const,
  calendar: (month: string) => ["calendar", month] as const,
};
