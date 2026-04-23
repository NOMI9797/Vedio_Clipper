import type { StoredTranscript, TranscriptWord } from "@/lib/transcription/transcript-types";

type Root = StoredTranscript & {
  jobId?: string;
  projectId?: string;
  createdAt?: string;
};

export function parseStoredTranscriptJson(raw: string): StoredTranscript {
  const j = JSON.parse(raw) as Root;
  return {
    language: j.language ?? "und",
    segments: j.segments ?? [],
    words: j.words ?? [],
    provider: j.provider === "openai" ? "openai" : "deepgram",
  };
}

export function sourceDurationFromTranscript(t: StoredTranscript): number {
  let maxT = 0;
  for (const s of t.segments) {
    maxT = Math.max(maxT, s.end);
  }
  for (const w of t.words) {
    maxT = Math.max(maxT, w.end);
  }
  return maxT;
}

export function wordsOverlappingSegment(
  words: TranscriptWord[],
  start: number,
  end: number
): TranscriptWord[] {
  return words.filter((w) => w.start < end && w.end > start);
}
