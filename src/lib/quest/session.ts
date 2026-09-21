import { DAILY_GOAL, ExerciseTypes } from "@contracts/quest";
import type { ExerciseType } from "@contracts/quest";
import type { ExerciseItem, Word, WordProgress } from "./types";

/** UTC 日期加减，返回 YYYY-MM-DD（移植自 api/practice-router.ts） */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 为一个词分配题型：带图的词四种题型都可能，无图的词只有题型1和4 */
export function assignType(word: Word): ExerciseType {
  const pool: ExerciseType[] =
    word.hasImage
      ? [
          ExerciseTypes.ZhToRu,
          ExerciseTypes.WordToImage,
          ExerciseTypes.ImageToWord,
          ExerciseTypes.Flashcard,
        ]
      : [ExerciseTypes.ZhToRu, ExerciseTypes.Flashcard];
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomWords(
  allWords: Word[],
  excludeIds: number[],
  n: number,
  withImage = false,
): Word[] {
  const excluded = new Set(excludeIds);
  const pool = allWords.filter(
    (w) => !excluded.has(w.id) && (!withImage || w.hasImage),
  );
  return shuffle(pool).slice(0, n);
}

/** 组装某词某题型的选项（原样移植；flashcard 返回 null） */
export function buildOptions(
  allWords: Word[],
  word: Word,
  type: ExerciseType,
): { options: string[]; correctIndex: number } | null {
  if (type === ExerciseTypes.ZhToRu) {
    const distract = randomWords(allWords, [word.id], 3);
    if (distract.length < 3) return null;
    const options = shuffle([word.russian, ...distract.map((w) => w.russian)]);
    return { options, correctIndex: options.indexOf(word.russian) };
  }
  if (type === ExerciseTypes.WordToImage) {
    const distract = randomWords(allWords, [word.id], 3, true);
    if (distract.length < 3) return null;
    const paths = [
      word.imagePath!,
      ...distract.map((w) => w.imagePath!),
    ];
    const options = shuffle(paths);
    return { options, correctIndex: options.indexOf(word.imagePath!) };
  }
  if (type === ExerciseTypes.ImageToWord) {
    const distract = randomWords(allWords, [word.id], 3);
    if (distract.length < 3) return null;
    const labels = [word.hanzi, ...distract.map((w) => w.hanzi)];
    const options = shuffle(labels);
    return { options, correctIndex: options.indexOf(word.hanzi) };
  }
  return null; // flashcard 无选项
}

/**
 * 每日组卷（原 startDaily 的三步补足逻辑，原样移植）：
 * 1. 到期复习词（按到期日升序）
 * 2. 新词（该用户无进度记录，按词 id 升序补足）
 * 3. 词库太小凑不满时随机重复已有词补足
 */
export function pickDailyWords(
  allWords: Word[],
  progress: WordProgress[],
  today: string,
): Word[] {
  const byWordId = new Map(allWords.map((w) => [w.id, w]));
  const picked: Word[] = [];

  // 1. 到期复习词
  const due = progress
    .filter((p) => p.nextDueDate <= today)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, DAILY_GOAL);
  for (const p of due) {
    const w = byWordId.get(p.wordId);
    if (w) picked.push(w);
  }

  // 2. 新词
  if (picked.length < DAILY_GOAL) {
    const seenIds = new Set(progress.map((p) => p.wordId));
    const fresh = allWords
      .filter((w) => !seenIds.has(w.id))
      .sort((a, b) => a.id - b.id)
      .slice(0, DAILY_GOAL - picked.length);
    picked.push(...fresh);
  }

  // 3. 随机重复补足
  if (picked.length > 0 && picked.length < DAILY_GOAL) {
    const pickedIds = picked.map((w) => w.id);
    const extra = randomWords(allWords, pickedIds, DAILY_GOAL - picked.length);
    picked.push(...extra);
  }

  return picked;
}

/** 组卷：为选出的每个词分配题型并组装选项；干扰项不足自动退化为翻面卡 */
export function buildDailyItems(
  allWords: Word[],
  picked: Word[],
): ExerciseItem[] {
  const items: ExerciseItem[] = [];
  for (let i = 0; i < picked.length; i++) {
    const word = picked[i];
    let type = assignType(word);
    let options = buildOptions(allWords, word, type);
    if (!options && type !== ExerciseTypes.Flashcard) {
      type = ExerciseTypes.Flashcard;
      options = null;
    }
    items.push({
      index: i,
      wordId: word.id,
      type,
      hanzi: word.hanzi,
      pinyin: word.pinyin,
      russian: word.russian,
      imagePath: word.hasImage ? word.imagePath : null,
      hasAudio: word.hasAudio,
      options: options?.options ?? null,
      correctIndex: options?.correctIndex ?? null,
    });
  }
  return items;
}
