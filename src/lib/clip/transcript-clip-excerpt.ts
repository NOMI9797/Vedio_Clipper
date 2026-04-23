import type { StoredTranscript } from "@/lib/transcription/transcript-types";

/**
 * Excerpt for [start, end) from word timings (for manual clip titles/excerpts).
 */
export function clipExcerptFromTranscriptWindow(
  t: StoredTranscript,
  start: number,
  end: number,
  maxLen = 2000
): string {
  return t.words
    .filter((w) => w.end > start && w.start < end)
    .map((w) => w.word)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
