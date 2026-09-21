import { useEffect, useMemo, useRef, useState } from "react";
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
  ExerciseTypes,
} from "@contracts/quest";
import type { ExerciseItem } from "@/lib/quest/types";
import { Bell, CheckCircle2, Flame, RotateCcw, Trophy } from "lucide-react";

type Item = ExerciseItem & {
  /** 客户端本地重现标记（答错后再练一次，不上报） */
  isRepeat?: boolean;
};

type Phase = "starting" | "empty" | "running" | "finished";

export default function Practice() {
  const today = todayStr();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("starting");
  const [sessionId, setSessionId] = useState(0);
  const [queue, setQueue] = useState<Item[]>([]);
  const [pos, setPos] = useState(0); // 当前做到队列第几题
  const [originalTotal, setOriginalTotal] = useState(0);
  const [answered, setAnswered] = useState<"correct" | "wrong" | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [startTime] = useState(Date.now());
  const [result, setResult] = useState<{
    total: number;
    correct: number;
    accuracy: number;
    streak: number;
    newBadges: string[];
  } | null>(null);

  const startMut = useMutation({ mutationFn: startDaily });
  const answerMut = useMutation({ mutationFn: submitAnswer });
  const finishMut = useMutation({ mutationFn: finishSession });

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startMut.mutate(
      { today },
      {
        onSuccess: (data) => {
          if (data.empty) {
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
        },
      );
    } else {
      setPos(nextPos);
    }
  };

  /** 选择题作答 */
  const choose = (optIdx: number) => {
    if (!item || answered) return;
    const good = optIdx === item.correctIndex;
    setPicked(optIdx);
    setAnswered(good ? "correct" : "wrong");

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
    setTimeout(() => advance(nextQueue, pos + 1), good ? 700 : 1400);
  };

  /** 翻面卡自评 */
  const rate = (known: boolean) => {
    if (!item || answered) return;
    setAnswered(known ? "correct" : "wrong");
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
    return (
      <Layout>
        <div className="py-24 text-center text-muted-foreground">
          Готовим ваши 30 заданий…
        </div>
      </Layout>
    );
  }

  if (phase === "empty") {
    return (
      <Layout>
        <div className="py-24 text-center space-y-4">
          <p className="text-4xl">📚</p>
          <h1 className="text-xl font-semibold">Словарь пока пуст</h1>
          <p className="text-muted-foreground">
            Учитель ещё не загрузил слова. Загляните позже!
          </p>
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
              День отмечен в календаре ✓
            </p>
          </div>

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

          <div className="flex items-center justify-center gap-2 text-primary font-semibold">
            <Flame className="w-5 h-5" fill="currentColor" />
            {result.streak}{" "}
            {result.streak === 1 ? "день" : result.streak < 5 ? "дня" : "дней"} подряд
          </div>

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
      <div className="max-w-xl mx-auto">
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
                  cls = "border-2 border-accent bg-accent/10 text-accent font-medium";
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
