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
};

/**
 * US-08: `processed/{jobId}/clip_manifest.json`
 */
export type ClipManifestEntry = {
  clipId: string;
  start: number;
  end: number;
  score: number;
  transcript_excerpt: string;
  suggested_title: string;
  selected: boolean;
};

export type ClipManifest = {
  jobId: string;
  generatedAt: string;
  clips: ClipManifestEntry[];
};
