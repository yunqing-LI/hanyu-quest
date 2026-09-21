import type { ExerciseType } from "@contracts/quest";

/** 领域类型：与改造前 tRPC 返回形状保持一致，页面代码无需适配 */

export interface Word {
  id: number;
  hanzi: string;
  pinyin: string;
  russian: string;
  isConcrete: boolean;
  hasImage: boolean;
  imagePath: string | null;
  hasAudio: boolean;
}

export interface WordProgress {
  wordId: number;
  level: number;
  nextDueDate: string;
  correctCount: number;
  wrongCount: number;
  lastResult: string | null;
}

/** 一道练习题的完整数据（前端本地组卷生成） */
export interface ExerciseItem {
  index: number;
  wordId: number;
  type: ExerciseType;
  hanzi: string;
  pinyin: string;
  russian: string;
  imagePath: string | null;
  hasAudio: boolean;
  options: string[] | null;
  correctIndex: number | null;
}

export interface DashboardData {
  goal: number;
  answeredToday: number;
  correctToday: number;
  doneToday: boolean;
  dueCount: number;
  totalWords: number;
  seenWords: number;
  levelDistribution: { level: number; n: number }[];
  streak: number;
  badges: { badgeCode: string; earnedAt: string }[];
}

export interface FinishResult {
  total: number;
  correct: number;
  accuracy: number;
  streak: number;
  newBadges: string[];
}
