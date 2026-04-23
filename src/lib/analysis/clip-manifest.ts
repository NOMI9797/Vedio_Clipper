import { randomUUID } from "node:crypto";

import type { AnalyzedSegment } from "@/lib/analysis/analysis-types";
import type { ClipManifest, ClipManifestEntry } from "@/lib/analysis/analysis-types";
import { tokenizeForTitle } from "@/lib/analysis/segment-scoring";

const MERGE_GAP_SEC = 0.8;
const MERGE_SCORE_FLOOR = 0.4;
const MIN_CLIP_SEC = 15;
const MAX_CLIP_SEC = 90;
const MAX_SEGMENTS = 15;
const MIN_SEGMENTS_WHEN_ENOUGH = 10;

function pickTopSegmentCount(total: number): number {
  if (total === 0) {
    return 0;
  }
  if (total < MIN_SEGMENTS_WHEN_ENOUGH) {
    return total;
  }
  return Math.min(MAX_SEGMENTS, total);
}

/**
 * Merge only when gap is small AND both segments meet score floor.
 */
function mergeTopSegmentsByTime(
  sortedByScore: AnalyzedSegment[],
  n: number
): AnalyzedSegment[][] {
  const top = sortedByScore.slice(0, n).sort((a, b) => a.start - b.start);
  const groups: AnalyzedSegment[][] = [];
  let cur: AnalyzedSegment[] = [];
  for (const seg of top) {
    if (cur.length === 0) {
      cur.push(seg);
      continue;
    }
    const prev = cur[cur.length - 1];
    const gap = seg.start - prev.end;
    const bothStrong =
      prev.score >= MERGE_SCORE_FLOOR && seg.score >= MERGE_SCORE_FLOOR;
    if (gap < MERGE_GAP_SEC && bothStrong) {
      cur.push(seg);
    } else {
      groups.push(cur);
      cur = [seg];
    }
  }
  if (cur.length > 0) {
    groups.push(cur);
  }
  return groups;
}

function combinedExcerpt(segs: AnalyzedSegment[]): string {
  return segs.map((s) => s.text.trim()).join(" ").replace(/\s+/g, " ").trim();
}

function combinedScore(segs: AnalyzedSegment[]): number {
  if (segs.length === 0) {
    return 0;
  }
  const scores = segs.map((s) => s.score);
  const mx = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.6 * mx + 0.4 * mean;
}

function lengthPenalty(durationSec: number): number {
  if (durationSec < 20) {
    return 0.85;
  }
  if (durationSec > 75) {
    return 0.9;
  }
  return 1;
}

/**
 * Shrink/expand clip window to [MIN_CLIP_SEC, MAX_CLIP_SEC] within [0, sourceMaxTime].
 */
function enforceDuration(
  start: number,
  end: number,
  excerpt: string,
  sourceMax: number
): { start: number; end: number; excerpt: string } {
  const s0 = Math.max(0, start);
  const e0 = Math.min(sourceMax, end);
  let dur = e0 - s0;
  const s = s0;
  let e = e0;
  if (dur > MAX_CLIP_SEC) {
    e = s + MAX_CLIP_SEC;
    const cap = Math.max(40, Math.floor(excerpt.length * (MAX_CLIP_SEC / dur)));
    let t = excerpt.slice(0, cap);
    const punct = t.search(/\.\s+[^.]*$/);
    for (const sep of [". ", "! ", "? "]) {
      const idx = t.lastIndexOf(sep);
      if (idx > 40) {
        t = t.slice(0, idx + 1).trim();
        break;
      }
    }
    if (punct > 30 && t.length < 20) {
      t = excerpt.slice(0, cap).trim();
    }
    return { start: s, end: e, excerpt: t || excerpt.slice(0, 500) };
  }
  if (dur < MIN_CLIP_SEC) {
    const need = MIN_CLIP_SEC - dur;
    e = Math.min(sourceMax, e + need);
    dur = e - s;
    if (dur < MIN_CLIP_SEC) {
      const ns = Math.max(0, s - (MIN_CLIP_SEC - dur));
      const ne = Math.min(sourceMax, ns + MIN_CLIP_SEC);
      return { start: ns, end: ne, excerpt };
    }
  }
  return { start: s, end: e, excerpt };
}

function suggestedTitle(excerpt: string): string {
  const toks = tokenizeForTitle(excerpt);
  if (toks.length === 0) {
    return "Highlight";
  }
  const counts = new Map<string, number>();
  for (const t of toks) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3).map(([w]) => w);
  const phrase = top.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * US-08: ranked clip manifest from scored segments.
 */
export function buildClipManifest(
  jobId: string,
  segments: AnalyzedSegment[],
  sourceMaxTime: number
): ClipManifest {
  if (segments.length === 0) {
    return { jobId, generatedAt: new Date().toISOString(), clips: [] };
  }

  const sorted = [...segments].sort((a, b) => b.score - a.score);
  const n = pickTopSegmentCount(sorted.length);
  const groups = mergeTopSegmentsByTime(sorted, n);
  const maxT = Math.max(sourceMaxTime, ...segments.map((s) => s.end), 0);

  const clips: ClipManifestEntry[] = [];
  for (const g of groups) {
    const rawStart = Math.max(0, g[0].start);
    const rawEnd = Math.min(maxT, g[g.length - 1].end);
    let excerpt = combinedExcerpt(g);
    const combined = combinedScore(g);
    const adj = enforceDuration(rawStart, rawEnd, excerpt, maxT);
    let start = adj.start;
    let end = adj.end;
    excerpt = adj.excerpt || excerpt;
    if (end - start > MAX_CLIP_SEC) {
      end = start + MAX_CLIP_SEC;
    }
    if (end - start < MIN_CLIP_SEC) {
      end = Math.min(maxT, start + MIN_CLIP_SEC);
    }
    const duration = end - start;
    const score = combined * lengthPenalty(duration);
    const title = suggestedTitle(excerpt);
    clips.push({
      clipId: randomUUID(),
      start,
      end,
      score,
      transcript_excerpt: excerpt.slice(0, 2000),
      suggested_title: title.slice(0, 120),
      selected: true,
    });
  }

  clips.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return {
    jobId,
    generatedAt: new Date().toISOString(),
    clips,
  };
}
