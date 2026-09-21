import type { jsPDF } from "jspdf";
import { BRAND_LINE, SITE_NAME } from "@contracts/quest";
import { formatRuDate } from "./dates";

// ─── 中文字体（子集，含西里尔/拼音/GB2312 汉字） ─────────────────────────────
let fontB64: string | null = null;

async function loadFontB64(): Promise<string> {
  if (fontB64) return fontB64;
  const resp = await fetch("/fonts/cjk-subset.ttf");
  if (!resp.ok) throw new Error("Не удалось загрузить шрифт");
  const buf = new Uint8Array(await resp.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  fontB64 = btoa(binary);
  return fontB64;
}

async function newDoc(): Promise<jsPDF> {
  // 动态加载 jspdf，避免其打入主包
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const b64 = await loadFontB64();
  doc.addFileToVFS("cjk-subset.ttf", b64);
  doc.addFont("cjk-subset.ttf", "CJK", "normal");
  doc.setFont("CJK", "normal");
  return doc;
}

// ─── 数据类型（与 reports 路由输出对应） ────────────────────────────────────
export type RangeReportData = {
  from: string;
  to: string;
  totalQuestions: number;
  totalCorrect: number;
  accuracy: number;
  totalDurationSec: number;
  checkinDays: number;
  checkinDates: string[];
  byDay: { date: string; total: number; correct: number; checkedIn: boolean }[];
  wrongWords: {
    wordId: number;
    hanzi: string;
    pinyin: string;
    russian: string;
    wrongCount: number;
  }[];
};

export type LevelReportData = {
  totalWords: number;
  seenWords: number;
  masteredCount: number;
  levelDistribution: { level: number; count: number }[];
  learned: {
    hanzi: string;
    pinyin: string;
    russian: string;
    level: number;
    correctCount: number;
    wrongCount: number;
  }[];
  unlearned: { hanzi: string; pinyin: string; russian: string }[];
};

// ─── 绘图助手 ────────────────────────────────────────────────────────────────
const C = {
  ink: [43, 38, 34] as const,
  red: [199, 64, 45] as const,
  jade: [47, 111, 94] as const,
  muted: [130, 120, 108] as const,
  paper: [250, 246, 239] as const,
};

function header(doc: jsPDF, title: string, studentEmail: string, period: string) {
  doc.setFillColor(...C.red);
  doc.rect(14, 12, 12, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text("汉", 20, 20.5, { align: "center" });

  doc.setTextColor(...C.ink);
  doc.setFontSize(16);
  doc.text(`«${SITE_NAME}» — ${title}`, 30, 19);
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(BRAND_LINE, 30, 25);
  doc.text(`Ученик: ${studentEmail}   ·   Период: ${period}`, 30, 30.5);
  doc.text(`Сформировано: ${formatRuDate(new Date().toISOString().slice(0, 10))}`, 196, 30.5, {
    align: "right",
  });
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.6);
  doc.line(14, 35, 196, 35);
}

function footer(doc: jsPDF, page: number, pages: number) {
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text(`«${SITE_NAME}» · ${BRAND_LINE}`, 14, 290);
  doc.text(`${page} / ${pages}`, 196, 290, { align: "right" });
}

function statBoxes(
  doc: jsPDF,
  y: number,
  stats: { value: string; label: string }[],
) {
  const w = (196 - 14 - (stats.length - 1) * 4) / stats.length;
  stats.forEach((s, i) => {
    const x = 14 + i * (w + 4);
    doc.setFillColor(...C.paper);
    doc.setDrawColor(220, 210, 195);
    doc.roundedRect(x, y, w, 20, 2, 2, "FD");
    doc.setTextColor(...C.ink);
    doc.setFontSize(13);
    doc.text(s.value, x + w / 2, y + 9, { align: "center" });
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(s.label, x + w / 2, y + 15.5, { align: "center" });
  });
}

function sectionTitle(doc: jsPDF, y: number, text: string) {
  doc.setFontSize(12);
  doc.setTextColor(...C.red);
  doc.text(text, 14, y);
  return y + 6;
}

/** 范围类报告（日/周/月/自定义） */
export async function downloadRangeReport(
  kindTitle: string,
  data: RangeReportData,
  studentEmail: string,
  filename: string,
) {
  const doc = await newDoc();
  const period =
    data.from === data.to
      ? formatRuDate(data.from)
      : `${formatRuDate(data.from)} — ${formatRuDate(data.to)}`;
  header(doc, kindTitle, studentEmail, period);

  let y = 44;
  const mm = Math.floor(data.totalDurationSec / 60);
  const ss = data.totalDurationSec % 60;
  statBoxes(doc, y, [
    { value: String(data.totalQuestions), label: "заданий выполнено" },
    { value: `${data.accuracy}%`, label: "точность" },
    { value: String(data.totalCorrect), label: "верных ответов" },
    { value: String(data.checkinDays), label: "дней отмечено" },
    { value: mm > 0 ? `${mm}м ${ss}с` : `${ss}с`, label: "время занятий" },
  ]);
  y += 30;

  // 按天柱状图
  if (data.byDay.length > 0) {
    y = sectionTitle(doc, y, "Занятия по дням");
    const maxTotal = Math.max(1, ...data.byDay.map((d) => d.total));
    for (const d of data.byDay) {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(8.5);
      doc.setTextColor(...C.ink);
      doc.text(formatRuDate(d.date), 14, y + 3.5);
      const barW = 110;
      const w = (d.total / maxTotal) * barW;
      doc.setFillColor(230, 222, 208);
      doc.rect(52, y, barW, 4.5, "F");
      if (d.total > 0) {
        doc.setFillColor(...C.red);
        doc.rect(52, y, w, 4.5, "F");
        const cw = maxTotal > 0 ? (d.correct / maxTotal) * barW : 0;
        doc.setFillColor(...C.jade);
        doc.rect(52, y, cw, 4.5, "F");
      }
      doc.setTextColor(...C.muted);
      doc.text(
        `${d.correct}/${d.total}${d.checkedIn ? " ✓" : ""}`,
        166,
        y + 3.5,
      );
      y += 7;
    }
    y += 4;
  }

  // 错词清单
  y = sectionTitle(doc, Math.max(y, 20), `Слова для повторения (${data.wrongWords.length})`);
  if (data.wrongWords.length === 0) {
    doc.setFontSize(9.5);
    doc.setTextColor(...C.jade);
    doc.text("Ошибок нет — отличная работа!", 14, y);
    y += 6;
  } else {
    for (const w of data.wrongWords) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(10);
      doc.setTextColor(...C.ink);
      doc.text(w.hanzi, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(...C.muted);
      doc.text(w.pinyin, 42, y);
      doc.setTextColor(...C.ink);
      const ru = doc.splitTextToSize(w.russian, 100);
      doc.text(ru[0], 78, y);
      doc.setTextColor(...C.red);
      doc.text(`×${w.wrongCount}`, 190, y, { align: "right" });
      y += 6;
    }
  }

  footer(doc, 1, doc.getNumberOfPages());
  for (let p = 2; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    footer(doc, p, doc.getNumberOfPages());
  }
  doc.save(filename);
}

/** 当前级别报告 */
export async function downloadLevelReport(
  data: LevelReportData,
  studentEmail: string,
  filename: string,
) {
  const doc = await newDoc();
  header(doc, "Отчёт по словарю", studentEmail, "весь период");

  let y = 44;
  statBoxes(doc, y, [
    { value: String(data.totalWords), label: "всего слов в словаре" },
    { value: String(data.seenWords), label: "изучается" },
    { value: String(data.masteredCount), label: "выучено (ур. 4–5)" },
    {
      value:
        data.totalWords > 0
          ? `${Math.round((data.seenWords / data.totalWords) * 100)}%`
          : "0%",
      label: "охват словаря",
    },
  ]);
  y += 30;

  // 掌握度分布
  y = sectionTitle(doc, y, "Распределение по уровням запоминания");
  const maxCount = Math.max(1, ...data.levelDistribution.map((l) => l.count));
  const labels = ["Новые", "Ур. 1 (1 день)", "Ур. 2 (3 дня)", "Ур. 3 (7 дней)", "Ур. 4 (15 дней)", "Ур. 5 (30 дней)"];
  for (const l of data.levelDistribution) {
    doc.setFontSize(8.5);
    doc.setTextColor(...C.ink);
    doc.text(labels[l.level] ?? `Ур. ${l.level}`, 14, y + 3.5);
    doc.setFillColor(230, 222, 208);
    doc.rect(52, y, 110, 4.5, "F");
    doc.setFillColor(l.level >= 4 ? C.jade[0] : C.red[0], l.level >= 4 ? C.jade[1] : C.red[1], l.level >= 4 ? C.jade[2] : C.red[2]);
    doc.rect(52, y, (l.count / maxCount) * 110, 4.5, "F");
    doc.setTextColor(...C.muted);
    doc.text(String(l.count), 166, y + 3.5);
    y += 7;
  }
  y += 6;

  // 已学词清单
  y = sectionTitle(doc, y, `Изучаемые слова (${data.learned.length})`);
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text("汉字", 14, y);
  doc.text("пиньинь", 42, y);
  doc.text("перевод", 78, y);
  doc.text("ур.", 172, y);
  doc.text("✓/✗", 190, y, { align: "right" });
  y += 5;
  for (const w of data.learned) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(9.5);
    doc.setTextColor(...C.ink);
    doc.text(w.hanzi, 14, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    doc.text(w.pinyin, 42, y);
    doc.setTextColor(...C.ink);
    const ru = doc.splitTextToSize(w.russian, 88);
    doc.text(ru[0], 78, y);
    doc.text(String(w.level), 172, y);
    doc.setTextColor(...C.muted);
    doc.text(`${w.correctCount}/${w.wrongCount}`, 190, y, { align: "right" });
    y += 5.6;
  }

  // 未学词
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  y += 4;
  y = sectionTitle(doc, y, `Ещё не начатые слова (${data.unlearned.length})`);
  for (const w of data.unlearned) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(9.5);
    doc.setTextColor(...C.ink);
    doc.text(w.hanzi, 14, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    doc.text(w.pinyin, 42, y);
    doc.setTextColor(...C.ink);
    const ru = doc.splitTextToSize(w.russian, 100);
    doc.text(ru[0], 78, y);
    y += 5.6;
  }

  footer(doc, 1, doc.getNumberOfPages());
  for (let p = 2; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    footer(doc, p, doc.getNumberOfPages());
  }
  doc.save(filename);
}
