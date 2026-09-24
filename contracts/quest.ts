// Ханьюй-квест — 全站共享常量（前端 @contracts / 后端均可引用）

export const SITE_NAME = "Ханьюй-квест";
export const BRAND_LINE = "китайский с Ли Лаоши";

/** 每日固定题量 */
export const DAILY_GOAL = 30;

/** 每天保底的新词名额：到期复习词最多占 DAILY_GOAL - DAILY_NEW_WORDS 席，防止复习挤掉全部新词 */
export const DAILY_NEW_WORDS = 18;

/** 掌握度等级 0-5 对应的复习间隔（天）。level 越高间隔越长 */
export const SRS_INTERVALS_DAYS = [1, 1, 3, 7, 15, 30] as const;
export const MAX_LEVEL = 5;

/** 题型 */
export const ExerciseTypes = {
  /** 看中文选俄语 */
  ZhToRu: "zh_to_ru",
  /** 看单词选图片 */
  WordToImage: "word_to_image",
  /** 看图片选单词 */
  ImageToWord: "image_to_word",
  /** 翻面卡 */
  Flashcard: "flashcard",
} as const;
export type ExerciseType = (typeof ExerciseTypes)[keyof typeof ExerciseTypes];

/** 作答结果 */
export const AnswerResults = {
  Correct: "correct",
  Wrong: "wrong",
  Known: "known",
  Unknown: "unknown",
} as const;
export type AnswerResult = (typeof AnswerResults)[keyof typeof AnswerResults];

/** 徽章代码 */
export const BadgeCodes = {
  FirstDaily: "first_daily", // 首次完成每日任务
  Streak7: "streak_7", // 连续 7 天
  Streak30: "streak_30", // 连续 30 天
  Mastered100: "mastered_100", // 累计掌握 100 词（level>=4）
  Answers1000: "answers_1000", // 累计完成 1000 题
} as const;
export type BadgeCode = (typeof BadgeCodes)[keyof typeof BadgeCodes];

export const BADGE_META: Record<BadgeCode, { icon: string; ru: string; desc: string }> = {
  first_daily: { icon: "🎯", ru: "Первый день", desc: "Выполнено первое дневное задание" },
  streak_7: { icon: "🔥", ru: "7 дней подряд", desc: "7 дней занятий без пропуска" },
  streak_30: { icon: "👑", ru: "30 дней подряд", desc: "30 дней занятий без пропуска" },
  mastered_100: { icon: "📚", ru: "100 слов", desc: "Выучено 100 слов" },
  answers_1000: { icon: "⚡", ru: "1000 заданий", desc: "Выполнено 1000 упражнений" },
};

/** 判断一个词是否为「已掌握」（用于徽章与报告） */
export const MASTERED_LEVEL = 4;
