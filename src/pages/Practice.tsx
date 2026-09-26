import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { queryClient } from "@/lib/query-client";
import {
  fetchAudio,
  finishSession,
  startDaily,
  submitAnswer,
} from "@/lib/data/practice";
import { Button } from "@/components/ui/button";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { todayStr } from "@/lib/dates";
import {
  AnswerResults,
  BADGE_META,
  DAILY_GOAL,
  ExerciseTypes,
} from "@contracts/quest";
import type { ExerciseItem } from "@/lib/quest/types";
import { Bell, Check, CheckCircle2, Flame, RotateCcw, Trophy } from "lucide-react";
import { playCorrectSound } from "@/lib/sfx";

/** 答对时随机展示的鼓励语 */
const PRAISES = [
  "Молодец!",
  "Отлично!",
  "Супер!",
  "Великолепно!",
  "Точно!",
  "Блестяще!",
  "Так держать!",
];

/** 鼓励动画的彩纸颗粒：方向向量 + 颜色 */
const SPARKS: { dx: number; dy: number; color: string }[] = [
  { dx: -90, dy: -70, color: "#f59e0b" },
  { dx: 90, dy: -80, color: "#22c55e" },
  { dx: -110, dy: 10, color: "#3b82f6" },
  { dx: 110, dy: 0, color: "#ec4899" },
  { dx: -70, dy: 80, color: "#a855f7" },
  { dx: 75, dy: 85, color: "#f59e0b" },
  { dx: 0, dy: -110, color: "#22c55e" },
  { dx: 0, dy: 110, color: "#3b82f6" },
];

type Item = ExerciseItem & {
  /** 客户端本地重现标记（答错后再练一次，不上报） */
  isRepeat?: boolean;
};

type Phase = "starting" | "empty" | "running" | "finished";

export default function Practice() {
  const today = todayStr();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("starting");
  const [emptyReason, setEmptyReason] = useState<"no_words" | "all_done">(
    "no_words",
  );
  const [sessionId, setSessionId] = useState(0);
  const [queue, setQueue] = useState<Item[]>([]);
  const [pos, setPos] = useState(0); // 当前做到队列第几题
  const [originalTotal, setOriginalTotal] = useState(0);
  /** 本地累计答对数：finishSession 失败时兜底出结果页用 */
  const correctCountRef = useRef(0);
  /** 进度写库失败标记：显示警告条，不再静默吞错 */
  const [saveError, setSaveError] = useState(false);
  /** 今日打卡成功标记（答满 DAILY_GOAL 时由 submitAnswer 触发）：完成页文案按它如实显示 */
  const [checkedIn, setCheckedIn] = useState(false);
  const [answered, setAnswered] = useState<"correct" | "wrong" | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [praise, setPraise] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  const [result, setResult] = useState<{
    total: number;
    correct: number;
    accuracy: number;
    streak: number | null; // finishSession 失败兜底时为 null（真实值未知，不显示假数字）
    newBadges: string[];
  } | null>(null);

  const startMut = useMutation({ mutationFn: startDaily });
  const answerMut = useMutation({
    mutationFn: submitAnswer,
    onSuccess: (data) => {
      // 答满当日目标即已打卡（服务端在 submitAnswer 内完成），刷新首页/日历缓存
      if (data.answeredToday >= DAILY_GOAL && !checkedIn) {
        setCheckedIn(true);
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
      }
    },
    onError: (e) => {
      console.error("[submitAnswer] 进度写库失败:", e);
      setSaveError(true);
    },
  });
  const finishMut = useMutation({
    mutationFn: finishSession,
    onError: (e) => {
      console.error("[finishSession] 失败:", e);
      setSaveError(true);
    },
  });

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startMut.mutate(
      { today },
      {
        onSuccess: (data) => {
          if (data.empty) {
            setEmptyReason(data.reason);
            setPhase("empty");
            return;
          }
          setSessionId(data.sessionId);
          setQueue(data.items as Item[]);
          setOriginalTotal(data.items.length);
          setPhase("running");
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 加载超过 15 秒仍未完成 → 显示重试提示（网络不稳定时不至于无限转圈） */
  const [slowStart, setSlowStart] = useState(false);
  useEffect(() => {
    if (phase !== "starting") return;
    const t = setTimeout(() => setSlowStart(true), 15000);
    return () => clearTimeout(t);
  }, [phase]);

  const item: Item | undefined = queue[pos];
  const doneOriginal = useMemo(
    () => queue.slice(0, pos).filter((q) => !q.isRepeat).length,
    [queue, pos],
  );

  const playAudio = async (wordId: number) => {
    const res = await fetchAudio(wordId);
    if (res) {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mime }));
      new Audio(url).play();
    }
  };

  const advance = (nextQueue: Item[], nextPos: number) => {
    setAnswered(null);
    setPicked(null);
    setFlipped(false);
    setPraise(null);
    if (nextPos >= nextQueue.length) {
      const durationSec = Math.round((Date.now() - startTime) / 1000);
      finishMut.mutate(
        { sessionId, durationSec, today },
        {
          onSuccess: (r) => {
            setResult(r);
            setPhase("finished");
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["calendar"] });
          },
          onError: () => {
            // 服务器没存上也不把用户卡在最后一题：用本地统计出结果页，
            // 但 streak 未知（null），页面会显示保存失败警告而不是假数字
            setResult({
              total: originalTotal,
              correct: correctCountRef.current,
              accuracy:
                originalTotal > 0
                  ? Math.round((correctCountRef.current / originalTotal) * 100)
                  : 0,
              streak: null,
              newBadges: [],
            });
            setPhase("finished");
          },
        },
      );
    } else {
      setPos(nextPos);
    }
  };

  /** 答对：音效 + 鼓励语（视觉反馈由 answered === "correct" 的覆盖层展示） */
  const celebrate = () => {
    playCorrectSound();
    setPraise(PRAISES[Math.floor(Math.random() * PRAISES.length)]);
  };

  /** 选择题作答 */
  const choose = (optIdx: number) => {
    if (!item || answered) return;
    const good = optIdx === item.correctIndex;
    setPicked(optIdx);
    setAnswered(good ? "correct" : "wrong");
    if (good) celebrate();
    if (good && !item.isRepeat) correctCountRef.current += 1;

    if (!item.isRepeat) {
      answerMut.mutate({
        sessionId,
        wordId: item.wordId,
        exerciseType: item.type,
        result: good ? AnswerResults.Correct : AnswerResults.Wrong,
        today,
      });
    }
    const nextQueue =
      !good && !item.isRepeat
        ? [...queue, { ...item, isRepeat: true }]
        : queue;
    setQueue(nextQueue);
    setTimeout(() => advance(nextQueue, pos + 1), good ? 1000 : 1400);
  };

  /** 翻面卡自评 */
  const rate = (known: boolean) => {
    if (!item || answered) return;
    setAnswered(known ? "correct" : "wrong");
    if (known) celebrate();
    if (known && !item.isRepeat) correctCountRef.current += 1;
    if (!item.isRepeat) {
      answerMut.mutate({
        sessionId,
        wordId: item.wordId,
        exerciseType: item.type,
        result: known ? AnswerResults.Known : AnswerResults.Unknown,
        today,
      });
    }
    const nextQueue =
      !known && !item.isRepeat
        ? [...queue, { ...item, isRepeat: true }]
        : queue;
    setQueue(nextQueue);
    setTimeout(() => advance(nextQueue, pos + 1), 600);
  };

  if (phase === "starting") {
    const failed = startMut.isError || slowStart;
    return (
      <Layout>
        <div className="py-24 text-center space-y-4">
          {failed ? (
            <>
              <p className="text-4xl">📡</p>
              <p className="font-medium">Не удалось загрузить задания</p>
              <p className="text-sm text-muted-foreground">
                Проверьте подключение к интернету и попробуйте ещё раз.
              </p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Попробовать ещё раз
              </Button>
            </>
          ) : (
            <div className="text-muted-foreground">Готовим ваши 30 заданий…</div>
          )}
        </div>
      </Layout>
    );
  }

  if (phase === "empty") {
    return (
      <Layout>
        <div className="py-24 text-center space-y-4">
          {emptyReason === "all_done" ? (
            <>
              <p className="text-4xl">🎉</p>
              <h1 className="text-xl font-semibold">На сегодня всё!</h1>
              <p className="text-muted-foreground">
                Нет слов для повторения — выученные слова ещё «отдыхают».
                Загляните завтра!
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl">📚</p>
              <h1 className="text-xl font-semibold">Словарь пока пуст</h1>
              <p className="text-muted-foreground">
                Учитель ещё не загрузил слова. Загляните позже!
              </p>
            </>
          )}
          <Button variant="outline" onClick={() => navigate("/")}>
            На главную
          </Button>
        </div>
      </Layout>
    );
  }

  if (phase === "finished" && result) {
    const mins = Math.floor((Date.now() - startTime) / 60000);
    const secs = Math.round(((Date.now() - startTime) / 1000) % 60);
    return (
      <Layout>
        <div className="max-w-md mx-auto py-10 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent/10">
            <Trophy className="w-10 h-10 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Задание выполнено!</h1>
            <p className="text-muted-foreground mt-1">
              {saveError && !checkedIn
                ? "День пока не отмечен — см. предупреждение ниже"
                : "День отмечен в календаре ✓"}
            </p>
          </div>

          {saveError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Не удалось сохранить результат целиком. Проверьте подключение к
              интернету и обновите страницу или откройте главную сегодня —
              отметка дня восстановится автоматически.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold tabular-nums">
                {result.correct}/{result.total}
              </div>
              <div className="text-xs text-muted-foreground">верно</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold tabular-nums">{result.accuracy}%</div>
              <div className="text-xs text-muted-foreground">точность</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold tabular-nums">
                {mins > 0 ? `${mins}м ${secs}с` : `${secs}с`}
              </div>
              <div className="text-xs text-muted-foreground">время</div>
            </div>
          </div>

          {result.streak !== null && (
            <div className="flex items-center justify-center gap-2 text-primary font-semibold">
              <Flame className="w-5 h-5" fill="currentColor" />
              {result.streak}{" "}
              {result.streak === 1 ? "день" : result.streak < 5 ? "дня" : "дней"} подряд
            </div>
          )}

          {result.newBadges.length > 0 && (
            <div className="rounded-xl border-2 border-primary/40 bg-card p-4 space-y-2">
              <p className="font-semibold text-primary">Новые достижения!</p>
              {result.newBadges.map((code) => {
                const meta = BADGE_META[code as keyof typeof BADGE_META];
                return (
                  <div key={code} className="flex items-center gap-2 justify-center">
                    <span className="text-2xl">{meta?.icon}</span>
                    <span className="font-medium">{meta?.ru}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/">На главную</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/reports">Скачать отчёт</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!item) return null;

  const isFlashcard = item.type === ExerciseTypes.Flashcard;
  const isImagePrompt = item.type === ExerciseTypes.ImageToWord;
  const isImageOptions = item.type === ExerciseTypes.WordToImage;

  return (
    <Layout>
      {/* 答对鼓励：音效与动画同时出现 */}
      {answered === "correct" && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="relative flex flex-col items-center animate-correct-pop">
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full animate-sparkle"
                style={
                  {
                    backgroundColor: s.color,
                    "--dx": `${s.dx}px`,
                    "--dy": `${s.dy}px`,
                  } as CSSProperties
                }
              />
            ))}
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl shadow-accent/40">
              <Check className="h-14 w-14" strokeWidth={3.5} />
            </div>
            <p className="mt-3 rounded-full bg-card/90 px-5 py-1.5 text-2xl font-bold text-accent shadow-md">
              {praise}
            </p>
          </div>
        </div>
      )}
      <div className="max-w-xl mx-auto">
        {saveError && (
          <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Не удалось сохранить прогресс. Проверьте подключение к интернету и
            обновите страницу — уже отвеченные задания сохранены и не потеряются.
          </p>
        )}
        {/* 进度条 */}
        <div className="flex items-center gap-3 mb-6">
          <ProgressBar
            value={(doneOriginal / Math.max(originalTotal, 1)) * 100}
            className="h-2.5 flex-1"
          />
          <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
            {Math.min(doneOriginal + 1, originalTotal)} / {originalTotal}
          </span>
        </div>

        {item.isRepeat && (
          <p className="flex items-center gap-1.5 text-sm text-primary mb-3">
            <RotateCcw className="w-4 h-4" /> Повторим ещё раз
          </p>
        )}

        {/* 题干 */}
        <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm text-center mb-5 relative">
          {item.hasAudio && (
            <button
              onClick={() => playAudio(item.wordId)}
              className="absolute top-4 right-4 flex items-center gap-1 text-xs text-primary border border-primary/40 rounded-full px-2.5 py-1 hover:bg-primary/10 transition-colors"
              title="Прослушать произношение"
            >
              <Bell className="w-3.5 h-3.5" /> Подсказка
            </button>
          )}

          {isImagePrompt ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Что изображено на картинке?
              </p>
              <img
                src={item.imagePath ?? ""}
                alt=""
                className="mx-auto rounded-xl max-h-56 object-contain"
              />
            </div>
          ) : (
            <div>
              <p className="font-hanzi text-5xl md:text-6xl font-bold tracking-wide">
                {item.hanzi}
              </p>
              <p className="text-lg text-muted-foreground mt-2">{item.pinyin}</p>
              {isFlashcard && item.imagePath && !flipped && (
                <img
                  src={item.imagePath}
                  alt=""
                  className="mx-auto rounded-xl max-h-40 object-contain mt-4"
                />
              )}
            </div>
          )}

          {isFlashcard && (
            <div className="mt-6">
              {flipped ? (
                <div className="rounded-xl bg-secondary p-4">
                  <p className="text-lg font-medium">{item.russian}</p>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setFlipped(true)}>
                  Показать перевод
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 选项 / 自评 */}
        {isFlashcard ? (
          flipped && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={() => rate(false)}
                disabled={!!answered}
              >
                Не знаю
              </Button>
              <Button
                size="lg"
                className="bg-accent hover:bg-accent/90"
                onClick={() => rate(true)}
                disabled={!!answered}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Знаю
              </Button>
            </div>
          )
        ) : (
          <div className={`grid gap-3 ${isImageOptions ? "grid-cols-2" : "grid-cols-1"}`}>
            {item.options?.map((opt, i) => {
              const isCorrect = i === item.correctIndex;
              const isPicked = i === picked;
              let cls =
                "border bg-card hover:border-primary/60 hover:bg-secondary/60";
              if (answered) {
                if (isCorrect)
                  cls =
                    "border-2 border-accent bg-accent/15 text-accent font-semibold scale-[1.03] shadow-lg shadow-accent/30 ring-2 ring-accent/50";
                else if (isPicked)
                  cls = "border-2 border-destructive bg-destructive/10 text-destructive";
                else cls = "border bg-card opacity-50";
              }
              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  disabled={!!answered}
                  className={`rounded-xl p-3.5 text-left transition-all ${cls}`}
                >
                  {isImageOptions ? (
                    <img
                      src={opt}
                      alt=""
                      className="w-full h-32 object-contain rounded-lg"
                    />
                  ) : (
                    <span className={item.type === ExerciseTypes.ImageToWord ? "font-hanzi text-2xl" : ""}>
                      {opt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
