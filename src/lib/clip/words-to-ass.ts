import type { TranscriptWord } from "@/lib/transcription/transcript-types";

/**
 * Ass time H:MM:SS.cc (centiseconds, last field)
 */
function assTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t - h * 3600 - m * 60;
  const sec = Math.floor(s);
  const cs = Math.min(99, Math.round((s - sec) * 100));
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escAssText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "(")
    .replace(/}/g, ")")
    .replace(/\n/g, " ");
}

const ASS_HEADER = `[Script Info]
Title: preview
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,32,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,20,20,32,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/**
 * Word-by-word events relative to 0 = clip in-point (for trimmed preview).
 */
export function wordsToAssForClip(
  words: TranscriptWord[],
  clipIn: number,
  clipOut: number
): string {
  const lines: string[] = [];
  for (const w of words) {
    if (w.end <= clipIn + 0.01 || w.start >= clipOut - 0.01) {
      continue;
    }
    const st = Math.max(0, w.start - clipIn);
    const en = Math.min(clipOut - clipIn, Math.max(st + 0.05, w.end - clipIn));
    const text = escAssText(w.word);
    if (!text) {
      continue;
    }
    lines.push(
      `Dialogue: 0,${assTime(st)},${assTime(en)},Default,,0,0,0,,${text}`
    );
  }
  if (lines.length === 0) {
    return "";
  }
  return `${ASS_HEADER}${lines.join("\n")}\n`;
}
