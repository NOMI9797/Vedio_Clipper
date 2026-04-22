import { readFile } from "node:fs/promises";

import type { StoredTranscript, TranscriptSegment, TranscriptWord } from "@/lib/transcription/transcript-types";
import { toIso639_1 } from "@/lib/transcription/lang";

const DEEPGRAM_URL =
  "https://api.deepgram.com/v1/listen";

type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  confidence?: number;
};

type DeepgramUtterance = {
  start?: number;
  end?: number;
  transcript?: string;
  confidence?: number;
  words?: DeepgramWord[];
};

type DeepgramResponse = {
  metadata?: {
    language?: string;
    languages?: { language?: string; confidence?: number }[];
  };
  results?: {
    channels?: {
      alternatives?: {
        words?: DeepgramWord[];
        transcript?: string;
      }[];
    }[];
    utterances?: DeepgramUtterance[];
  };
  utterances?: DeepgramUtterance[];
};

function mapWords(list: DeepgramWord[] | undefined): TranscriptWord[] {
  if (!list || !Array.isArray(list)) {
    return [];
  }
  return list.map((w) => ({
    start: Number(w.start ?? 0),
    end: Number(w.end ?? 0),
    word: String(w.punctuated_word ?? w.word ?? "").trim() || "…",
    confidence:
      typeof w.confidence === "number" && !Number.isNaN(w.confidence)
        ? w.confidence
        : 0,
  }));
}

function mapUtterances(
  utterances: DeepgramUtterance[] | undefined
): TranscriptSegment[] {
  if (!utterances || !Array.isArray(utterances)) {
    return [];
  }
  return utterances
    .map((u) => ({
      start: Number(u.start ?? 0),
      end: Number(u.end ?? 0),
      text: String(u.transcript ?? "").trim(),
    }))
    .filter((s) => s.text.length > 0);
}

function pickLanguage(dg: DeepgramResponse): string {
  const meta = dg.metadata;
  if (meta?.language) {
    return toIso639_1(meta.language);
  }
  const first = meta?.languages?.[0]?.language;
  if (first) {
    return toIso639_1(first);
  }
  return "und";
}

function parseDeepgramJson(raw: string): StoredTranscript {
  const dg = JSON.parse(raw) as DeepgramResponse;
  const alt = dg.results?.channels?.[0]?.alternatives?.[0];
  const wrds = mapWords(alt?.words);
  const utteranceList = dg.utterances ?? dg.results?.utterances;
  const segments = mapUtterances(utteranceList);
  if (segments.length === 0 && (alt?.transcript || wrds.length)) {
    const text = (alt?.transcript ?? wrds.map((w) => w.word).join(" ")).trim();
    if (text) {
      const s0 = wrds[0]?.start ?? 0;
      const s1 = wrds[wrds.length - 1]?.end ?? s0;
      segments.push({ start: s0, end: s1, text });
    }
  }
  return {
    language: pickLanguage(dg),
    segments,
    words: wrds,
    provider: "deepgram",
  };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Transcribe WAV via Deepgram (verbose response with words + utterances).
 * Retries up to 3 times on failure with exponential backoff (1s, 2s, 4s).
 */
export async function transcribeWavWithDeepgram(
  wavPath: string,
  apiKey: string
): Promise<StoredTranscript> {
  const body = await readFile(wavPath);
  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    words: "true",
    detect_language: "true",
    numerals: "true",
  });
  const url = `${DEEPGRAM_URL}?${params.toString()}`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delay);
    }
    try {
      console.info(
        `[transcription:US-05] Deepgram attempt ${attempt + 1}/${MAX_RETRIES + 1}`
      );
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/wav",
        },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(
          `Deepgram ${res.status}: ${text.slice(0, 500)}`
        );
        if (res.status >= 500 || res.status === 429) {
          continue;
        }
        throw lastErr;
      }
      return parseDeepgramJson(text);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt === MAX_RETRIES) {
        throw lastErr;
      }
    }
  }
  throw lastErr ?? new Error("Deepgram: unknown error");
}
