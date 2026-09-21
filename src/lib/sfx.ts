/**
 * 答对音效：用 WebAudio 实时合成的上行琶音，无音频文件、无版权问题。
 * 每次调用新建短音符，AudioContext 复用单例。
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  peak: number,
  type: OscillatorType = "sine",
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** 明快的「答对啦」提示音：E5→G5→C6 上行琶音 + 高音点缀 */
export function playCorrectSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 659.25, t, 0.35, 0.22, "triangle"); // E5
  tone(ac, 783.99, t + 0.09, 0.35, 0.22, "triangle"); // G5
  tone(ac, 1046.5, t + 0.18, 0.5, 0.26, "triangle"); // C6
  tone(ac, 2093.0, t + 0.26, 0.3, 0.08); // C7 泛音点缀
}
