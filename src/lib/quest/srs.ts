import {
  AnswerResults,
  BadgeCodes,
  MASTERED_LEVEL,
  MAX_LEVEL,
  SRS_INTERVALS_DAYS,
} from "@contracts/quest";
import type { AnswerResult, BadgeCode } from "@contracts/quest";
import { addDays } from "./session";
import type { WordProgress } from "./types";

/** 答对（含翻面卡自评"认识"）则升级，否则降级（原样移植 submitAnswer） */
export function nextLevel(curLevel: number, result: AnswerResult): number {
  const good =
    result === AnswerResults.Correct || result === AnswerResults.Known;
  return good
    ? Math.min(curLevel + 1, MAX_LEVEL)
    : Math.max(curLevel - 1, 0);
}

export function nextDueDate(today: string, newLevel: number): string {
  return addDays(today, SRS_INTERVALS_DAYS[newLevel]);
}

/** 计算连续打卡天数（以 today 或昨天为终点向前数，原样移植 computeStreak） */
export function computeStreak(checkinDates: string[], today: string): number {
  if (checkinDates.length === 0) return 0;
  const set = new Set(checkinDates);
  let cursor = today;
  if (!set.has(cursor)) cursor = addDays(cursor, -1); // 今天还没打卡，从昨天算起
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * 评估应得的徽章（纯计算，不含已拥有过滤与入库）。
 * firstDaily 由调用方在完成每日任务时传入（原逻辑如此）。
 */
export function badgeCandidates(input: {
  firstDaily: boolean;
  streak: number;
  masteredCount: number;
  answersCount: number;
}): BadgeCode[] {
  const candidates: BadgeCode[] = [];
  if (input.firstDaily) candidates.push(BadgeCodes.FirstDaily);
  if (input.streak >= 7) candidates.push(BadgeCodes.Streak7);
  if (input.streak >= 30) candidates.push(BadgeCodes.Streak30);
  if (input.masteredCount >= 100) candidates.push(BadgeCodes.Mastered100);
  if (input.answersCount >= 1000) candidates.push(BadgeCodes.Answers1000);
  return candidates;
}

export function countMastered(progress: WordProgress[]): number {
  return progress.filter((p) => p.level >= MASTERED_LEVEL).length;
}
