import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteWord,
  fetchAdminWordList,
  importWords,
  uploadAudio,
  type ImportItem,
} from "@/lib/data/words";
import { fetchAudio } from "@/lib/data/practice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, Trash2, Upload, Volume2 } from "lucide-react";

// ─── 词表解析 ────────────────────────────────────────────────────────────────
type ParsedWord = {
  hanzi: string;
  pinyin: string;
  russian: string;
  isConcrete: boolean;
  toneWarning: boolean;
};

const TONE_MARKS = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ";

function hasTone(pinyin: string): boolean {
  return (
    [...TONE_MARKS].some((m) => pinyin.includes(m)) || /[1-5]/.test(pinyin)
  );
}

/** 按 CSV 规则切一行（识别引号内的逗号） */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelim(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function mkWord(hanzi: string, pinyin: string, russian: string, isConcrete: boolean): ParsedWord | null {
  hanzi = hanzi.trim();
  pinyin = pinyin.trim();
  russian = russian.trim();
  if (!hanzi || !russian) return null;
  return {
    hanzi,
    pinyin: pinyin || "—",
    russian,
    isConcrete,
    toneWarning: pinyin !== "" && !hasTone(pinyin),
  };
}

function parseLines(text: string): ParsedWord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // ① 表头模式：首行含「词」和「拼音/pinyin」→ 按列名映射（范例格式）
  const first = lines[0];
  const delim = detectDelim(first);
  const header = splitCsvLine(first, delim).map((s) => s.toLowerCase());
  const iHz = header.findIndex((h) => h === "词" || h === "汉字" || h === "hanzi");
  const iPy = header.findIndex((h) => h === "拼音" || h === "pinyin");
  const iRu = header.findIndex((h) =>
    ["俄语释义", "俄语", "翻译", "释义", "russian", "перевод"].includes(h),
  );
  if (iHz >= 0 && iPy >= 0 && iRu >= 0) {
    const iPic = header.findIndex((h) =>
      ["配图", "直观词", "картинка"].includes(h),
    );
    const out: ParsedWord[] = [];
    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line, detectDelim(line));
      const w = mkWord(
        cols[iHz] ?? "",
        cols[iPy] ?? "",
        cols[iRu] ?? "",
        iPic >= 0 ? cols[iPic] === "是" || cols[iPic] === "1" : false,
      );
      if (w) out.push(w);
    }
    return out;
  }

  // ② 逐行模式：词 (pīnyīn) - перевод；或三列（Tab/分号/逗号）
  const out: ParsedWord[] = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s*\(([^)]*)\)\s*[-–—:]\s*(.+)$/);
    if (m) {
      const w = mkWord(m[1], m[2], m[3], false);
      if (w) out.push(w);
      continue;
    }
    const parts = splitCsvLine(line, detectDelim(line));
    if (parts.length >= 3) {
      const w = mkWord(parts[0], parts[1], parts.slice(2).join(", "), false);
      if (w) out.push(w);
    }
  }
  return out;
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  if (user && user.role !== "admin") {
    return (
      <Layout>
        <div className="py-24 text-center text-muted-foreground">
          Эта страница доступна только учителю.
        </div>
      </Layout>
    );
  }
  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-1">Кабинет учителя</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Загрузка слов, озвучка и статистика по словарю
      </p>
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Импорт слов</TabsTrigger>
          <TabsTrigger value="audio">Озвучка</TabsTrigger>
          <TabsTrigger value="overview">Обзор словаря</TabsTrigger>
        </TabsList>
        <TabsContent value="import">
          <ImportTab />
        </TabsContent>
        <TabsContent value="audio">
          <AudioTab />
        </TabsContent>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

// ─── 1. 导入 ─────────────────────────────────────────────────────────────────
const ADMIN_WORDS_KEY = ["admin-words"];

function ImportTab() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedWord[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMut = useMutation({
    mutationFn: (items: ImportItem[]) => importWords(items),
    onSuccess: (r) => {
      setParsed(null);
      setText("");
      queryClient.invalidateQueries({ queryKey: ADMIN_WORDS_KEY });
      alert(`Готово! Добавлено: ${r.inserted}, пропущено (уже были): ${r.skipped}`);
    },
    onError: (e: Error) => alert("Ошибка импорта: " + e.message),
  });

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setParsed(null);
    };
    reader.readAsText(f, "utf-8");
  };

  return (
    <div className="space-y-4 mt-4">
      <section className="rounded-xl border bg-card p-4 text-sm space-y-1.5">
        <p className="font-medium">Как загрузить слова — два способа:</p>
        <ol className="list-decimal list-inside text-muted-foreground space-y-1">
          <li>
            Вставьте текст: каждая строка = <code>词 (pīnyīn) - перевод</code>
          </li>
          <li>
            Или выберите CSV-файл. Поддерживается стандартный шаблон с шапкой
            (词, 拼音, 俄语释义, 配图) — галочки «картинка» проставятся сами. В
            Excel: «Сохранить как → CSV».
          </li>
        </ol>
        <p className="text-muted-foreground">
          Галочка «картинка» = предметное слово, к нему будет иллюстрация и
          задания с картинками. Жёлтым подсвечен пиньинь без тонов — проверьте.
        </p>
      </section>

      <Textarea
        rows={8}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParsed(null);
        }}
        placeholder={"苹果 (píngguǒ) - яблоко\n看书 (kànshū) - читать (книгу)\n…"}
        className="font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4 mr-1.5" /> Выбрать CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button
          onClick={() => setParsed(parseLines(text))}
          disabled={!text.trim()}
        >
          Предпросмотр
        </Button>
      </div>

      {parsed && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-sm">
              Распознано слов: <b>{parsed.length}</b>
              {parsed.some((w) => w.toneWarning) && (
                <span className="text-primary ml-2">
                  · {parsed.filter((w) => w.toneWarning).length} без тонов
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setParsed(parsed.map((w) => ({ ...w, isConcrete: true })))
                }
              >
                Картинка: все
              </Button>
              <Button
                size="sm"
                disabled={parsed.length === 0 || importMut.isPending}
                onClick={() =>
                  importMut.mutate(
                    parsed.map((w) => ({
                      hanzi: w.hanzi,
                      pinyin: w.pinyin,
                      russian: w.russian,
                      isConcrete: w.isConcrete,
                    })),
                  )
                }
              >
                {importMut.isPending ? "Загружаю…" : "Загрузить в словарь"}
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>汉字</TableHead>
                  <TableHead>Пиньинь</TableHead>
                  <TableHead>Перевод</TableHead>
                  <TableHead className="w-20">Картинка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((w, i) => (
                  <TableRow
                    key={i}
                    className={w.toneWarning ? "bg-yellow-50" : ""}
                  >
                    <TableCell className="font-hanzi text-lg">{w.hanzi}</TableCell>
                    <TableCell>
                      {w.pinyin}
                      {w.toneWarning && (
                        <span className="text-primary text-xs ml-1">нет тона</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{w.russian}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={w.isConcrete}
                        onCheckedChange={(v) => {
                          const next = [...parsed];
                          next[i] = { ...w, isConcrete: v === true };
                          setParsed(next);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── 2. 录音管理 ─────────────────────────────────────────────────────────────
function AudioTab() {
  const words = useQuery({
    queryKey: ADMIN_WORDS_KEY,
    queryFn: fetchAdminWordList,
  });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const uploadMut = useMutation({
    mutationFn: (input: { wordId: number; base64: string; mime: string }) =>
      uploadAudio(input.wordId, input.base64, input.mime),
    onSuccess: () => {
      setMsg("Аудио сохранено ✓");
      queryClient.invalidateQueries({ queryKey: ADMIN_WORDS_KEY });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: Error) => alert("Ошибка: " + e.message),
  });

  const filtered = useMemo(() => {
    const list = words.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (w) =>
        w.hanzi.includes(s) ||
        w.pinyin.toLowerCase().includes(s) ||
        w.russian.toLowerCase().includes(s),
    );
  }, [words.data, q]);

  const sendFile = (wordId: number, f: File) => {
    if (f.size > 5 * 1024 * 1024) {
      alert("Файл больше 5 МБ — сожмите запись");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(",")[1] ?? "";
      uploadMut.mutate({ wordId, base64: b64, mime: f.type || "audio/mpeg" });
    };
    reader.readAsDataURL(f);
  };

  const play = async (wordId: number) => {
    const res = await fetchAudio(wordId);
    if (res) {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      new Audio(URL.createObjectURL(new Blob([bytes], { type: res.mime }))).play();
    }
  };

  return (
    <div className="space-y-3 mt-4">
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Нажмите «Загрузить» и выберите mp3-файл с произношением слова — или
        просто <b>перетащите файл</b> на строку слова. Повторная загрузка
        заменяет запись.
      </section>
      <div className="flex items-center gap-3">
        <Input
          placeholder="Поиск: иероглиф / пиньинь / перевод"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        {msg && <span className="text-sm text-accent">{msg}</span>}
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="max-h-[480px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>汉字</TableHead>
                <TableHead>Пиньинь</TableHead>
                <TableHead>Перевод</TableHead>
                <TableHead className="w-44">Озвучка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => (
                <AudioRow
                  key={w.id}
                  word={w}
                  onFile={(f) => sendFile(w.id, f)}
                  onPlay={() => play(w.id)}
                  busy={uploadMut.isPending}
                />
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {words.isLoading ? "Загрузка…" : "Слов не найдено"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function AudioRow({
  word,
  onFile,
  onPlay,
  busy,
}: {
  word: { id: number; hanzi: string; pinyin: string; russian: string; hasAudio: boolean };
  onFile: (f: File) => void;
  onPlay: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <TableRow
      className={dragOver ? "bg-primary/10" : ""}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <TableCell className="font-hanzi text-lg">{word.hanzi}</TableCell>
      <TableCell>{word.pinyin}</TableCell>
      <TableCell className="text-sm">{word.russian}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {word.hasAudio && (
            <Button variant="ghost" size="icon" onClick={onPlay} title="Прослушать">
              <Play className="w-4 h-4 text-accent" />
            </Button>
          )}
          <Button
            variant={word.hasAudio ? "outline" : "default"}
            size="sm"
            disabled={busy}
            onClick={() => ref.current?.click()}
          >
            <Volume2 className="w-3.5 h-3.5 mr-1" />
            {word.hasAudio ? "Заменить" : "Загрузить"}
          </Button>
          <input
            ref={ref}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── 3. 词库总览 ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const words = useQuery({
    queryKey: ADMIN_WORDS_KEY,
    queryFn: fetchAdminWordList,
  });
  const [q, setQ] = useState("");
  const delMut = useMutation({
    mutationFn: (input: { wordId: number }) => deleteWord(input.wordId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ADMIN_WORDS_KEY }),
  });

  const filtered = useMemo(() => {
    const list = words.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (w) =>
        w.hanzi.includes(s) ||
        w.pinyin.toLowerCase().includes(s) ||
        w.russian.toLowerCase().includes(s),
    );
  }, [words.data, q]);

  return (
    <div className="space-y-3 mt-4">
      <Input
        placeholder="Поиск по словарю"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>汉字</TableHead>
                <TableHead>Пиньинь</TableHead>
                <TableHead>Перевод</TableHead>
                <TableHead>Карт.</TableHead>
                <TableHead>Звук</TableHead>
                <TableHead className="text-right">Упражн.</TableHead>
                <TableHead className="text-right">% ош.</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-hanzi text-lg">{w.hanzi}</TableCell>
                  <TableCell>{w.pinyin}</TableCell>
                  <TableCell className="text-sm max-w-[220px] truncate">
                    {w.russian}
                  </TableCell>
                  <TableCell>{w.hasImage ? "🖼" : w.isConcrete ? "·" : "—"}</TableCell>
                  <TableCell>{w.hasAudio ? "🔊" : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{w.practiced}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {w.errorRate === null ? "—" : `${w.errorRate}%`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Удалить слово"
                      onClick={() => {
                        if (confirm(`Удалить слово ${w.hanzi}?`))
                          delMut.mutate({ wordId: w.id });
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {words.isLoading ? "Загрузка…" : "Словарь пуст — загрузите слова"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Всего слов: {words.data?.length ?? 0}
      </p>
    </div>
  );
}
