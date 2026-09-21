// Ханьюй-квест — 数据库行类型（与 Supabase Postgres 表结构一一对应）
// 注意：列名保持数据库 snake_case，与 supabase-js 返回形状一致。
// 前端业务代码使用 src/lib/data 里的 camelCase 领域类型。

export interface WordRow {
  id: number;
  hanzi: string;
  pinyin: string;
  russian: string;
  is_concrete: boolean;
  has_image: boolean;
  image_path: string | null;
  has_audio: boolean;
  created_at: string;
}

export interface WordAudioRow {
  word_id: number;
  audio_base64: string;
  mime: string;
  updated_at: string;
}

export interface UserWordProgressRow {
  id: number;
  user_id: string;
  word_id: number;
  /** 掌握度 0-5 */
  level: number;
  next_due_date: string;
  correct_count: number;
  wrong_count: number;
  last_result: string | null;
  updated_at: string;
}

export interface ExerciseSessionRow {
  id: number;
  user_id: string;
  /** YYYY-MM-DD */
  date: string;
  total: number;
  correct: number;
  duration_sec: number;
  completed_at: string | null;
  created_at: string;
}

export interface ExerciseItemRow {
  id: number;
  user_id: string;
  session_id: number;
  word_id: number;
  exercise_type: string;
  /** correct / wrong / known / unknown */
  result: string;
  created_at: string;
}

export interface CheckinRow {
  id: number;
  user_id: string;
  /** YYYY-MM-DD */
  date: string;
  created_at: string;
}

export interface BadgeRow {
  id: number;
  user_id: string;
  badge_code: string;
  earned_at: string;
}

export * from "./errors";
