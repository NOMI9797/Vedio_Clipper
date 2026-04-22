/**
 * Stored at `processed/{jobId}/transcript.json` (US-05).
 */
export type TranscriptWord = {
  start: number;
  end: number;
  word: string;
  confidence: number;
};

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type StoredTranscript = {
  language: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  provider: "deepgram" | "openai";
};
