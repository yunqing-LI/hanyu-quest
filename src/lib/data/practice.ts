import {
  AnswerResults,
  DAILY_GOAL,
  type AnswerResult,
  type ExerciseType,
} from "@contracts/quest";
import type {
  BadgeRow,
  ExerciseSessionRow,
  UserWordProgressRow,
} from "@contracts/types";
import { supabase } from "@/lib/supabase";
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
  const { data, error } = await supabase
    .from("user_word_progress")
    .select("*");
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
  const { data, error } = await supabase
    .from("checkins")
    .select("date")
    .order("date", { ascending: true });
  must(error);
  return (data ?? []).map((r) => r.date as string);
}

// ─── 首页仪表盘（原 practice.dashboard） ─────────────────────────────────────

export async function fetchDashboard(today: string): Promise<DashboardData> {
  const [progress, checkinDates, badgeRows, wordsRes, sessions] =
    await Promise.all([
      fetchProgressRows(),
      fetchCheckinDates(),
      supabase.from("badges").select("badge_code, earned_at"),
      supabase
        .from("words")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("exercise_sessions")
        .select("total, correct, completed_at")
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
  const doneToday = todaySessions.some(
    (x) => x.completed_at !== null && x.total >= DAILY_GOAL,
  );

  const levelDistMap = new Map<number, number>();
  let dueCount = 0;
  for (const p of progress) {
    if (p.next_due_date <= today) dueCount++;
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

// ─── 打卡日历（原 practice.calendar） ────────────────────────────────────────

export async function fetchCalendar(month: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("checkins")
    .select("date")
    .like("date", `${month}-%`)
    .order("date", { ascending: true });
  must(error);
  return (data ?? []).map((r) => r.date as string);
}

// ─── 开始每日练习（原 practice.startDaily） ──────────────────────────────────

export type StartDailyResult =
  | { empty: true; sessionId: 0; items: [] }
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
    return { empty: true, sessionId: 0, items: [] };
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
}): Promise<{ ok: true; newLevel: number }> {
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
  const { data: existing, error: pErr } = await supabase
    .from("user_word_progress")
    .select("*")
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

  return { ok: true, newLevel };
}

// ─── 完成今日练习：计时、打卡、发徽章（原 practice.finishSession） ──────────

export async function finishSession(input: {
  sessionId: number;
  durationSec: number;
  today: string;
}): Promise<FinishResult> {
  const session = await fetchSessionRow(input.sessionId);
  if (!session) throw new Error("Session not found");

  const { error: sErr } = await supabase
    .from("exercise_sessions")
    .update({
      completed_at: new Date().toISOString(),
      duration_sec: input.durationSec,
    })
    .eq("id", input.sessionId);
  must(sErr);

  // 打卡（同日重复忽略，靠唯一约束 + upsert）
  const { error: cErr } = await supabase
    .from("checkins")
    .upsert({ date: input.today }, { onConflict: "user_id,date" });
  must(cErr);

  // 徽章评估
  const [checkinDates, progress, badgeRows, answersRes] = await Promise.all([
    fetchCheckinDates(),
    fetchProgressRows(),
    supabase.from("badges").select("badge_code"),
    supabase
      .from("exercise_items")
      .select("*", { count: "exact", head: true }),
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
