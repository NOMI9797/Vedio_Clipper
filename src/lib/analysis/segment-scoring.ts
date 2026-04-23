import type { AnalyzedSegment, AnalysisResult, SegmentScoreFactors } from "@/lib/analysis/analysis-types";
import { cosineSimilarity, embedTextsOpenAI } from "@/lib/analysis/embeddings-openai";
import { buildTopicTextForEmbedding } from "@/lib/analysis/topic-text";
import {
  sourceDurationFromTranscript,
  wordsOverlappingSegment,
} from "@/lib/analysis/parse-stored-transcript";
import type { StoredTranscript, TranscriptSegment, TranscriptWord } from "@/lib/transcription/transcript-types";

const POS = new Set(
  "great good amazing love best better awesome excellent fantastic wonderful incredible powerful beautiful mind blowing brilliant".split(" ")
);
const NEG = new Set(
  "bad worse worst hate terrible awful boring stupid wrong failed sad scary boring".split(" ")
);
const HOOK_PATTERNS = [
  /\?/,
  /watch this/i,
  /here('s| is) (why|how)/i,
  /you (won't|will not) believe/i,
  /buckle up/i,
  /let me (show|explain)/i,
  /the (truth|secret|key)/i,
  /(important|critical|vital) (point|thing)/i,
];

const STOP = new Set(
  "the a an and or but in on at to for of is are was were be been being that this these those it with as by from as".split(" ")
);

const RECAP_RE =
  /\b(again|once more|to recap|let me repeat|as (a )?reminder|summar(y|ize)|in summary)\b/i;

/** Weights (sum = 1.0) — hook slightly reduced vs TF-IDF era; semantic carries more when available. */
const W_HOOK = 0.28;
const W_PACE = 0.22;
const W_SEM = 0.25;
const W_SENT = 0.15;
const W_BOUND = 0.1;
const RECAP_BLEND = 0.06;

/** Exported for US-08 title generation. */
export function tokenizeForTitle(text: string): string[] {
  return tokenize(text).filter((t) => !STOP.has(t) && t.length > 1);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 1);
}

function buildDocTermFreq(segments: TranscriptSegment[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const s of segments) {
    const seen = new Set<string>();
    for (const w of Array.from(new Set(tokenize(s.text)))) {
      if (STOP.has(w) || w.length < 2) {
        continue;
      }
      seen.add(w);
    }
    for (const w of Array.from(seen)) {
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }
  return df;
}

function termTf(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const w of tokenize(text)) {
    if (STOP.has(w)) {
      continue;
    }
    tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  return tf;
}

function keywordFallback(
  text: string,
  docDf: Map<string, number>,
  nDocs: number
): number {
  const tf = termTf(text);
  if (tf.size === 0) {
    return 0.2;
  }
  let sum = 0;
  for (const [term, c] of Array.from(tf.entries())) {
    const df = docDf.get(term) ?? 1;
    const idf = Math.log(1 + nDocs / df);
    sum += c * idf;
  }
  return Math.min(1, sum / 12);
}

function segmentWpm(
  words: TranscriptWord[],
  seg: TranscriptSegment
): number {
  const w = wordsOverlappingSegment(words, seg.start, seg.end);
  const wUse = w.length > 0 ? w : fakeWordsFromSegment(seg);
  const duration = Math.max(0.15, seg.end - seg.start);
  return wUse.length / (duration / 60);
}

function speechEnergyRaw(
  words: TranscriptWord[],
  seg: TranscriptSegment
): number {
  const w = wordsOverlappingSegment(words, seg.start, seg.end);
  const wUse = w.length > 0 ? w : fakeWordsFromSegment(seg);
  const duration = Math.max(0.15, seg.end - seg.start);
  if (wUse.length < 2) {
    return 0.35;
  }
  const wpm = wUse.length / (duration / 60);
  const wpmNorm = Math.min(1, wpm / 220);
  const gaps: number[] = [];
  for (let i = 0; i < wUse.length - 1; i += 1) {
    gaps.push(wUse[i + 1].start - wUse[i].end);
  }
  const longPauses = gaps.filter((g) => g > 0.45).length;
  const pauseRatio = longPauses / Math.max(1, gaps.length);
  return Math.min(1, Math.max(0, wpmNorm * 0.62 + (1 - pauseRatio) * 0.38));
}

/** Intensity: strong positive or negative both score high. */
function sentimentIntensityRaw(text: string): number {
  const toks = tokenize(text);
  if (toks.length === 0) {
    return 0;
  }
  let pos = 0;
  let neg = 0;
  for (const t of toks) {
    if (POS.has(t)) {
      pos += 1;
    }
    if (NEG.has(t)) {
      neg += 1;
    }
  }
  const raw = (pos - neg) / Math.max(1, toks.length);
  return Math.min(1, Math.abs(raw) * 4);
}

function hookPatternScore(text: string): number {
  let hits = 0;
  for (const re of HOOK_PATTERNS) {
    if (re.test(text)) {
      hits += 1;
    }
  }
  if (text.includes("?")) {
    hits += 0.4;
  }
  return Math.min(1, hits / 4);
}

function recapSignalRaw(text: string): number {
  return RECAP_RE.test(text) ? 1 : 0;
}

function jaccardDistanceTokens(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const x of Array.from(A)) {
    if (B.has(x)) {
      inter += 1;
    }
  }
  const union = A.size + B.size - inter;
  const j = union > 0 ? inter / union : 0;
  return 1 - j;
}

function minMaxNormalize(values: number[]): (v: number) => number {
  if (values.length === 0) {
    return () => 0;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const r = max - min || 1;
  return (v: number) => (v - min) / r;
}

function fakeWordsFromSegment(seg: TranscriptSegment): TranscriptWord[] {
  const words = seg.text.split(/\s+/).filter(Boolean);
  const d = (seg.end - seg.start) / Math.max(1, words.length);
  return words.map((w, i) => ({
    word: w,
    start: seg.start + i * d,
    end: seg.start + (i + 1) * d,
    confidence: 0.5,
  }));
}

/**
 * US-07: async segment scoring. Uses OpenAI embeddings when OPENAI_API_KEY is set.
 */
export async function scoreTranscriptSegments(
  jobId: string,
  t: StoredTranscript
): Promise<AnalysisResult> {
  const segments = t.segments;
  const duration = sourceDurationFromTranscript(t);
  const docDf = buildDocTermFreq(segments);
  const nDocs = Math.max(1, segments.length);
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  const wpms = segments.map((seg) => segmentWpm(t.words, seg));
  const globalWpm =
    wpms.length > 0
      ? wpms.reduce((a, b) => a + b, 0) / wpms.length
      : 120;

  const paceRaw = wpms.map((wpm) => Math.min(Math.abs(wpm - globalWpm) / 50, 1));
  const energyRaw = segments.map((seg) => speechEnergyRaw(t.words, seg));
  const sentRaw = segments.map((seg) => sentimentIntensityRaw(seg.text));
  const hookRaw = segments.map((seg) => hookPatternScore(seg.text));
  const recapRaw = segments.map((seg) => recapSignalRaw(seg.text));

  let semRaw: number[] = segments.map((seg) =>
    keywordFallback(seg.text, docDf, nDocs)
  );
  let boundRaw: number[] = new Array(segments.length).fill(0);
  let usedEmbeddings = false;

  if (openaiKey && segments.length > 0) {
    try {
      const topicText = buildTopicTextForEmbedding(t, duration);
      const segTexts = segments.map((s) => s.text.slice(0, 8000));
      const toEmbed = [topicText, ...segTexts];
      const embs = await embedTextsOpenAI(toEmbed, openaiKey);
      const topicEmb = embs[0];
      // embs[0] = topic, embs[1 + i] = segment i
      semRaw = segments.map((_, i) => {
        const sim = cosineSimilarity(topicEmb, embs[i + 1] ?? []);
        return Math.min(1, Math.max(0, sim));
      });
      boundRaw = segments.map((_, i) => {
        if (i === 0) {
          return 0;
        }
        const d = 1 - cosineSimilarity(embs[i] ?? [], embs[i + 1] ?? []);
        return Math.min(1, Math.max(0, d * 1.2));
      });
      usedEmbeddings = true;
    } catch (e) {
      console.error("[analysis] embeddings failed, using TF-IDF + Jaccard", e);
      semRaw = segments.map((seg) => keywordFallback(seg.text, docDf, nDocs));
      boundRaw = segments.map((seg, i) => {
        if (i === 0) {
          return 0;
        }
        return jaccardDistanceTokens(segments[i - 1].text, seg.text);
      });
    }
  } else {
    boundRaw = segments.map((seg, i) => {
      if (i === 0) {
        return 0;
      }
      return jaccardDistanceTokens(segments[i - 1].text, seg.text);
    });
  }

  const nP = minMaxNormalize(paceRaw);
  const nE = minMaxNormalize(energyRaw);
  const nS = minMaxNormalize(sentRaw);
  const nH = minMaxNormalize(hookRaw);
  const nK = minMaxNormalize(semRaw);
  const nB = minMaxNormalize(boundRaw);

  const out: AnalyzedSegment[] = segments.map((seg, i) => {
    const recapVal = recapRaw[i] ?? 0;
    const factors: SegmentScoreFactors = {
      hookPattern: nH(hookRaw[i] ?? 0),
      paceChange: nP(paceRaw[i] ?? 0),
      semanticRelevance: nK(semRaw[i] ?? 0),
      sentimentIntensity: nS(sentRaw[i] ?? 0),
      topicBoundary: nB(boundRaw[i] ?? 0),
      recapSignal: recapVal,
      speechEnergy: nE(energyRaw[i] ?? 0),
    };
    const base =
      W_HOOK * factors.hookPattern +
      W_PACE * factors.paceChange +
      W_SEM * factors.semanticRelevance +
      W_SENT * factors.sentimentIntensity +
      W_BOUND * factors.topicBoundary;
    const withRecap = base * (1 - RECAP_BLEND + RECAP_BLEND * recapVal);
    return {
      index: i,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      score: Math.min(1, Math.max(0, withRecap)),
      factors,
    };
  });

  return {
    jobId,
    generatedAt: new Date().toISOString(),
    sourceDurationSec: duration,
    semanticWithEmbeddings: usedEmbeddings,
    segments: out,
  };
}
