/**
 * US-07: `processed/{jobId}/analysis.json`
 */
export type SegmentScoreFactors = {
  hookPattern: number;
  /** Pace delta vs global WPM (engagement). */
  paceChange: number;
  /** Cosine similarity to topic embedding, or TF-IDF fallback when no OpenAI. */
  semanticRelevance: number;
  /** Emotional intensity (absolute valence), not raw polarity. */
  sentimentIntensity: number;
  /** Topic shift at segment start (0–1). */
  topicBoundary: number;
  /** "Again / recap" style emphasis (0–1). */
  recapSignal: number;
  /** "speechEnergy" kept name in JSON for backward compat: raw energy proxy (0–1). */
  speechEnergy: number;
};

export type AnalyzedSegment = {
  index: number;
  start: number;
  end: number;
  text: string;
  score: number;
  factors: SegmentScoreFactors;
};

export type AnalysisResult = {
  jobId: string;
  generatedAt: string;
  sourceDurationSec: number;
  /** true when OpenAI embeddings were used for semantic + boundary. */
  semanticWithEmbeddings?: boolean;
  segments: AnalyzedSegment[];
  /** Pre-computed envelope (0–1) for UI; ~`waveformSamplesPerSec` bins per second of source. */
  waveformPeaks?: number[];
  waveformSamplesPerSec?: number;
};

/**
 * US-08: `processed/{jobId}/clip_manifest.json`
 */
export type ClipManifestEntry = {
  clipId: string;
  start: number;
  end: number;
  /** AI score; null for user-added manual clips. */
  score: number | null;
  transcript_excerpt: string;
  suggested_title: string;
  /** When false, clip is deselected for render. Omitted in older manifests — treat as true. */
  selected?: boolean;
  /** Set when the user has adjusted in/out (PATCH start/end). */
  edited?: boolean;
  /** User-created clip (US-11). */
  manual?: boolean;
  /** Preview MP4 at `clips/{clipId}/preview.mp4` is available. */
  preview_ready?: boolean;
};

export type ClipManifest = {
  jobId: string;
  generatedAt: string;
  clips: ClipManifestEntry[];
};
