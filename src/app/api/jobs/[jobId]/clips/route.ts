import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import type { AnalysisResult, ClipManifest, ClipManifestEntry } from "@/lib/analysis/analysis-types";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";
import { putProcessedJson } from "@/lib/storage/put-processed-json";
import { getTranscriptJsonString } from "@/lib/storage/get-transcript-json";
import { parseStoredTranscriptJson } from "@/lib/analysis/parse-stored-transcript";
import { clipExcerptFromTranscriptWindow } from "@/lib/clip/transcript-clip-excerpt";
import { requestClipPreviewRender } from "@/lib/clip/queue-clip-preview";
import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";

const MIN_S = 10;
const MAX_S = 90;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { jobId: string } }
) {
  const jobId = context.params.jobId;
  if (!isUuid(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }
  const [job] = await db
    .select({
      status: jobs.status,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, auth.user.sub)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "analysis_complete" && job.status !== "clips_ready") {
    return NextResponse.json(
      { error: "AI results are not ready yet for this job" },
      { status: 409 }
    );
  }

  try {
    const manifestRaw = await getProcessedJsonString(jobId, "clip_manifest.json");
    const manifest = JSON.parse(manifestRaw) as {
      clips?: ClipManifestEntry[];
    };
    const clips = (manifest.clips ?? [])
      .map((c) => ({
        ...c,
        selected: c.selected ?? true,
        score: c.score,
        previewReady: c.preview_ready === true,
        manual: c.manual === true,
      }))
      .sort(
        (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.clipId.localeCompare(b.clipId)
      );
    let sourceDurationSec = 0;
    try {
      const a = JSON.parse(
        await getProcessedJsonString(jobId, "analysis.json")
      ) as AnalysisResult;
      sourceDurationSec = a.sourceDurationSec ?? 0;
    } catch {
      // no analysis file
    }
    return NextResponse.json({ sourceDurationSec, clips });
  } catch {
    return NextResponse.json(
      { error: "AI result files missing or unreadable" },
      { status: 404 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: { jobId: string } }
) {
  const jobId = context.params.jobId;
  if (!isUuid(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }
  const [job] = await db
    .select({
      id: jobs.id,
      status: jobs.status,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, auth.user.sub)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "analysis_complete" && job.status !== "clips_ready") {
    return NextResponse.json(
      { error: "Clips are not available for this job yet" },
      { status: 409 }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body as { start?: unknown; end?: unknown; manual?: unknown };
  if (o.manual !== true) {
    return NextResponse.json(
      { error: "Body must include manual: true" },
      { status: 400 }
    );
  }
  if (typeof o.start !== "number" || typeof o.end !== "number") {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }
  const start = o.start;
  const end = o.end;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json({ error: "start and end must be finite" }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "end must be after start" }, { status: 400 });
  }
  const dur = end - start;
  if (dur < MIN_S || dur > MAX_S) {
    return NextResponse.json(
      { error: `Clip length must be between ${MIN_S}s and ${MAX_S}s` },
      { status: 400 }
    );
  }
  let analysis: AnalysisResult;
  try {
    analysis = JSON.parse(
      await getProcessedJsonString(jobId, "analysis.json")
    ) as AnalysisResult;
  } catch {
    return NextResponse.json(
      { error: "Analysis missing; cannot add clip" },
      { status: 404 }
    );
  }
  const smax = Math.max(0, analysis.sourceDurationSec ?? 0);
  if (start < 0 || end > smax) {
    return NextResponse.json(
      { error: `Clip must stay within 0 and ${smax.toFixed(2)}s` },
      { status: 400 }
    );
  }
  const rawTr = await getTranscriptJsonString(jobId);
  const t = parseStoredTranscriptJson(rawTr);
  const excerpt = clipExcerptFromTranscriptWindow(t, start, end);
  const title =
    excerpt.length > 0
      ? `Manual: ${excerpt.slice(0, 80).trim()}${excerpt.length > 80 ? "…" : ""}`
      : "Manual clip";

  let manifest: ClipManifest;
  try {
    manifest = JSON.parse(
      await getProcessedJsonString(jobId, "clip_manifest.json")
    ) as ClipManifest;
  } catch {
    return NextResponse.json({ error: "Clip manifest missing" }, { status: 404 });
  }

  const newClip: ClipManifestEntry = {
    clipId: randomUUID(),
    start,
    end,
    score: null,
    transcript_excerpt: excerpt || "—",
    suggested_title: title.slice(0, 120),
    selected: true,
    manual: true,
    preview_ready: false,
  };
  const clips = [...(manifest.clips ?? []), newClip];
  await putProcessedJson(
    jobId,
    "clip_manifest.json",
    JSON.stringify({ ...manifest, clips }, null, 2)
  );
  requestClipPreviewRender(jobId, newClip.clipId);
  return NextResponse.json({
    ok: true,
    clip: {
      ...newClip,
      selected: true,
      previewReady: false,
      manual: true,
    },
  });
}
