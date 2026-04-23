import type { AnalyzedSegment } from "@/lib/analysis/analysis-types";

/**
 * Text excerpt for [start, end) from analysis segments, for manifest updates.
 */
export function clipExcerptFromAnalysisSegments(
  segments: AnalyzedSegment[],
  start: number,
  end: number,
  maxLen = 2000
): string {
  const t = start;
  const t2 = end;
  return segments
    .filter((s) => s.end > t && s.start < t2)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
