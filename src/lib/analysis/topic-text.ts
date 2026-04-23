import type { StoredTranscript } from "@/lib/transcription/transcript-types";

/**
 * Central topic text: first ~60s + last ~60s of transcript (by time), for embedding.
 */
export function buildTopicTextForEmbedding(
  t: StoredTranscript,
  durationSec: number
): string {
  const firstEnd = 60;
  const lastStart = Math.max(0, durationSec - 60);
  const firstParts: string[] = [];
  const lastParts: string[] = [];
  for (const s of t.segments) {
    if (s.end > 0 && s.start < firstEnd) {
      firstParts.push(s.text);
    }
    if (s.end > lastStart) {
      lastParts.push(s.text);
    }
  }
  const a = firstParts.join(" ").trim();
  const b = lastParts.join(" ").trim();
  const combined = [a, b].filter(Boolean).join(" \n");
  if (combined.length < 20) {
    return t.segments
      .slice(0, 5)
      .map((s) => s.text)
      .join(" ")
      .slice(0, 8000);
  }
  return combined.slice(0, 8000);
}
