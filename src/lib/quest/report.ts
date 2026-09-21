import { MASTERED_LEVEL } from "@contracts/quest";
import type { LevelReportData, RangeReportData } from "@/lib/pdf";

// ─── 报告聚合（纯函数，移植自 api/reports-router.ts 的 buildRangeReport / level） ───

interface SessionLike {
  id: number;
  date: string;
  total: number;
  correct: number;
  durationSec: number;
}

interface ItemLike {
  sessionId: number;
  wordId: number;
  result: string;
}

interface WordLike {
  id: number;
  hanzi: string;
  pinyin: string;
  russian: string;
}

interface ProgressLike {
  wordId: number;
  level: number;
  correctCount: number;
  wrongCount: number;
}

/** 日期范围聚合报告（日/区间/周/月共用） */
export function buildRangeReport(
  sessions: SessionLike[],
  items: ItemLike[],
  words: WordLike[],
  checkinDatesInRange: string[],
  from: string,
  to: string,
): RangeReportData {
  const sessionIds = new Set(sessions.map((s) => s.id));
  const wordById = new Map(words.map((w) => [w.id, w]));

  // 错词榜：区间内 result ∈ (wrong, unknown) 的题按词汇总
  const wrongMap = new Map<
    number,
    { wordId: number; hanzi: string; pinyin: string; russian: string; wrongCount: number }
  >();
  for (const it of items) {
    if (!sessionIds.has(it.sessionId)) continue;
    if (it.result !== "wrong" && it.result !== "unknown") continue;
    const w = wordById.get(it.wordId);
    if (!w) continue;
    const cur = wrongMap.get(it.wordId) ?? {
      wordId: it.wordId,
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      russian: w.russian,
      wrongCount: 0,
    };
    cur.wrongCount++;
    wrongMap.set(it.wordId, cur);
  }
  const wrongWords = [...wrongMap.values()].sort(
    (a, b) => b.wrongCount - a.wrongCount,
  );

  const totalQuestions = sessions.reduce((s, x) => s + x.total, 0);
  const totalCorrect = sessions.reduce((s, x) => s + x.correct, 0);
  const totalDuration = sessions.reduce((s, x) => s + x.durationSec, 0);

  // 按天细分
  const byDayMap = new Map<
    string,
    { date: string; total: number; correct: number; checkedIn: boolean }
  >();
  for (const s of sessions) {
    const d = byDayMap.get(s.date) ?? {
      date: s.date,
      total: 0,
      correct: 0,
      checkedIn: false,
    };
    d.total += s.total;
    d.correct += s.correct;
    byDayMap.set(s.date, d);
  }
  for (const c of checkinDatesInRange) {
    const d = byDayMap.get(c);
    if (d) d.checkedIn = true;
    else
      byDayMap.set(c, { date: c, total: 0, correct: 0, checkedIn: true });
  }

  return {
    from,
    to,
    totalQuestions,
    totalCorrect,
    accuracy:
      totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    totalDurationSec: totalDuration,
    checkinDays: checkinDatesInRange.length,
    checkinDates: checkinDatesInRange,
    byDay: [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    wrongWords,
  };
}

/** 当前级别报告：词表总掌握进度 */
export function buildLevelReport(
  allWords: WordLike[],
  progress: ProgressLike[],
): LevelReportData {
  const progressMap = new Map(progress.map((p) => [p.wordId, p]));

  const levelDist = [0, 0, 0, 0, 0, 0];
  const learned: LevelReportData["learned"] = [];
  const unlearned: LevelReportData["unlearned"] = [];

  for (const w of allWords) {
    const p = progressMap.get(w.id);
    if (p) {
      levelDist[p.level]++;
      learned.push({
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        russian: w.russian,
        level: p.level,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
      });
    } else {
      unlearned.push({ hanzi: w.hanzi, pinyin: w.pinyin, russian: w.russian });
    }
  }

  const masteredCount = levelDist.slice(MASTERED_LEVEL).reduce((a, b) => a + b, 0);

  return {
    totalWords: allWords.length,
    seenWords: learned.length,
    masteredCount,
    levelDistribution: levelDist.map((n, level) => ({ level, count: n })),
    learned: learned.sort((a, b) => b.level - a.level),
    unlearned,
  };
}
