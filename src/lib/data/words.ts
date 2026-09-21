import type { WordRow } from "@contracts/types";
import { supabase } from "@/lib/supabase";
import type { Word } from "@/lib/quest/types";

export function mapWord(row: WordRow): Word {
  return {
    id: row.id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    russian: row.russian,
    isConcrete: row.is_concrete,
    hasImage: row.has_image,
    imagePath: row.image_path,
    hasAudio: row.has_audio,
  };
}

function must(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** 全量词表（约 300 词，登录用户只读） */
export async function fetchWords(): Promise<Word[]> {
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: true });
  must(error);
  return (data ?? []).map((r) => mapWord(r as WordRow));
}

export interface AdminWord extends Word {
  practiced: number;
  errorRate: number | null;
}

/** 词库总览（开发者页）：每词 + 全员练习统计（依赖 RLS 开发者读策略） */
export async function fetchAdminWordList(): Promise<AdminWord[]> {
  const { data: words, error: wErr } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: false });
  must(wErr);

  const { data: stats, error: sErr } = await supabase
    .from("user_word_progress")
    .select("word_id, correct_count, wrong_count");
  must(sErr);

  const statMap = new Map<number, { correct: number; wrong: number }>();
  for (const s of stats ?? []) {
    const cur = statMap.get(s.word_id) ?? { correct: 0, wrong: 0 };
    cur.correct += s.correct_count;
    cur.wrong += s.wrong_count;
    statMap.set(s.word_id, cur);
  }

  return (words ?? []).map((w) => {
    const s = statMap.get(w.id) ?? { correct: 0, wrong: 0 };
    const total = s.correct + s.wrong;
    return {
      ...mapWord(w as WordRow),
      practiced: total,
      errorRate: total > 0 ? Math.round((s.wrong / total) * 100) : null,
    };
  });
}

export interface ImportItem {
  hanzi: string;
  pinyin: string;
  russian: string;
  isConcrete: boolean;
}

/** 批量导入词表：去重键 hanzi||russian（与原 admin 导入一致），分批 200 条 */
export async function importWords(
  items: ImportItem[],
): Promise<{ inserted: number; skipped: number }> {
  const { data: existing, error: eErr } = await supabase
    .from("words")
    .select("hanzi, russian");
  must(eErr);
  const seen = new Set(
    (existing ?? []).map((w) => `${w.hanzi}||${w.russian}`),
  );

  const toInsert = items
    .filter((w) => !seen.has(`${w.hanzi}||${w.russian}`))
    .map((w) => ({
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      russian: w.russian,
      is_concrete: w.isConcrete,
    }));
  for (let i = 0; i < toInsert.length; i += 200) {
    const { error } = await supabase
      .from("words")
      .insert(toInsert.slice(i, i + 200));
    must(error);
  }
  return { inserted: toInsert.length, skipped: items.length - toInsert.length };
}

/** 上传/替换单词录音（base64 mp3）；返回字节数 */
export async function uploadAudio(
  wordId: number,
  base64: string,
  mime: string,
): Promise<{ ok: true; size: number }> {
  const sizeBytes = Math.floor((base64.length * 3) / 4);
  if (sizeBytes < 100) throw new Error("Аудиофайл слишком маленький");
  if (sizeBytes > 5 * 1024 * 1024) throw new Error("Аудиофайл больше 5 МБ");

  const { error: aErr } = await supabase.from("word_audio").upsert({
    word_id: wordId,
    audio_base64: base64,
    mime,
  });
  must(aErr);

  const { error: wErr } = await supabase
    .from("words")
    .update({ has_audio: true })
    .eq("id", wordId);
  must(wErr);
  return { ok: true, size: sizeBytes };
}

/** 删除一个词（连同进度与做题明细；RLS 需开发者策略） */
export async function deleteWord(wordId: number): Promise<{ ok: true }> {
  const { error: pErr } = await supabase
    .from("user_word_progress")
    .delete()
    .eq("word_id", wordId);
  must(pErr);
  const { error: iErr } = await supabase
    .from("exercise_items")
    .delete()
    .eq("word_id", wordId);
  must(iErr);
  const { error: aErr } = await supabase
    .from("word_audio")
    .delete()
    .eq("word_id", wordId);
  must(aErr);
  const { error: wErr } = await supabase.from("words").delete().eq("id", wordId);
  must(wErr);
  return { ok: true };
}
