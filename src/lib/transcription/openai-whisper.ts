import { readFile } from "node:fs/promises";

import type { StoredTranscript, TranscriptSegment, TranscriptWord } from "@/lib/transcription/transcript-types";
import { toIso639_1 } from "@/lib/transcription/lang";

type OpenAiVerbose = {
  language?: string;
  duration?: number;
  text?: string;
  words?: { word: string; start: number; end: number }[];
  segments?: {
    start: number;
    end: number;
    text: string;
    no_speech_prob?: number;
    avg_logprob?: number;
  }[];
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fromLogProb(p: number | undefined): number {
  if (p == null || Number.isNaN(p)) {
    return 0.9;
  }
  const c = Math.exp(p);
  return Math.max(0, Math.min(1, c));
}

function parseOpenAiJson(raw: string): StoredTranscript {
  const v = JSON.parse(raw) as OpenAiVerbose;
  const language = toIso639_1(
    v.language && typeof v.language === "string" ? v.language : "und"
  );
  const wrds: TranscriptWord[] = (v.words ?? []).map((w) => ({
    start: w.start,
    end: w.end,
    word: w.word,
    confidence: 0.95,
  }));
  const segments: TranscriptSegment[] = (v.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text?.trim() ?? "",
  })).filter((s) => s.text.length > 0);
  if (wrds.length === 0 && segments.length) {
    for (const s of v.segments ?? []) {
      const conf = fromLogProb(s.avg_logprob);
      const words = s.text
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const n = words.length;
      if (n === 0) {
        continue;
      }
      const span = s.end - s.start;
      const step = span / n;
      words.forEach((word, i) => {
        wrds.push({
          start: s.start + i * step,
          end: s.start + (i + 1) * step,
          word,
          confidence: conf,
        });
      });
    }
  }
  return {
    language,
    segments: segments.length
      ? segments
      : v.text
        ? [{ start: 0, end: v.duration ?? 0, text: v.text.trim() }]
        : [],
    words: wrds,
    provider: "openai",
  };
}

/**
 * OpenAI `whisper-1` with `response_format=verbose_json` (US-05 alternative).
 * Retries up to 3 times with exponential backoff on 5xx/429/network errors.
 */
export async function transcribeWavWithOpenAI(
  wavPath: string,
  apiKey: string
): Promise<StoredTranscript> {
  const buf = await readFile(wavPath);
  const url = "https://api.openai.com/v1/audio/transcriptions";

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new Blob([new Uint8Array(buf)], { type: "audio/wav" }),
        "audio.wav"
      );
      fd.append("model", "whisper-1");
      fd.append("response_format", "verbose_json");
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(`OpenAI ${res.status}: ${text.slice(0, 400)}`);
        if (res.status >= 500 || res.status === 429) {
          continue;
        }
        throw lastErr;
      }
      return parseOpenAiJson(text);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt === MAX_RETRIES) {
        throw lastErr;
      }
    }
  }
  throw lastErr ?? new Error("OpenAI transcription failed");
}
