import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";
import { downloadObjectToTempFile } from "@/lib/storage/download-object-temp";
import { extractWavSegment } from "@/lib/transcription/ffmpeg-audio-segment";
import { downloadSourceUrlToTempFile } from "@/lib/transcription/download-source-url-temp";

import type { AnalysisResult } from "@/lib/analysis/analysis-types";

const FFMPEG_BIN = process.env.FFMPEG_PATH?.trim();
const MAX_SEGMENT_SEC = 120;

type ClipEntry = { clipId: string; start: number; end: number };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { jobId: string; clipId: string } }
) {
  const { jobId, clipId } = context.params;
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
      objectKey: jobs.objectKey,
      sourceUrl: jobs.sourceUrl,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, auth.user.sub)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "analysis_complete" && job.status !== "clips_ready") {
    return NextResponse.json({ error: "Clips are not ready yet" }, { status: 409 });
  }

  const u = new URL(request.url);
  const fromP = u.searchParams.get("from");
  const toP = u.searchParams.get("to");
  if (fromP === null || toP === null) {
    return NextResponse.json(
      { error: "Query from and to (seconds) are required" },
      { status: 400 }
    );
  }
  const fromSec = Number(fromP);
  const toSec = Number(toP);
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec)) {
    return NextResponse.json({ error: "from and to must be numbers" }, { status: 400 });
  }
  if (toSec <= fromSec) {
    return NextResponse.json({ error: "to must be after from" }, { status: 400 });
  }
  const dur = toSec - fromSec;
  if (dur > MAX_SEGMENT_SEC) {
    return NextResponse.json(
      { error: `Segment length must be at most ${MAX_SEGMENT_SEC}s` },
      { status: 400 }
    );
  }

  const manifest = JSON.parse(
    await getProcessedJsonString(jobId, "clip_manifest.json")
  ) as { clips?: ClipEntry[] };
  const clip = (manifest.clips ?? []).find((c) => c.clipId === clipId);
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  let analysis: AnalysisResult;
  try {
    analysis = JSON.parse(
      await getProcessedJsonString(jobId, "analysis.json")
    ) as AnalysisResult;
  } catch {
    return NextResponse.json({ error: "Analysis data missing" }, { status: 404 });
  }
  const sourceMax = Math.max(0, analysis.sourceDurationSec ?? 0);
  if (fromSec < 0 || toSec > sourceMax) {
    return NextResponse.json(
      { error: `Audio window must be within 0 and ${sourceMax.toFixed(2)}s` },
      { status: 400 }
    );
  }

  let mediaCleanup: (() => Promise<void>) | null = null;
  let outDir = "";
  try {
    const dl = job.objectKey
      ? await downloadObjectToTempFile(job.objectKey)
      : job.sourceUrl
        ? await downloadSourceUrlToTempFile(job.sourceUrl)
        : null;
    if (!dl) {
      return NextResponse.json({ error: "Job has no media source" }, { status: 409 });
    }
    mediaCleanup = dl.cleanup;
    outDir = await mkdtemp(join(tmpdir(), "vc-audio-"));
    const outWav = join(outDir, "segment.wav");
    await extractWavSegment(dl.mediaPath, outWav, fromSec, dur, {
      ffmpegBin: FFMPEG_BIN,
    });
    const bytes = await readFile(outWav);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg || "Audio extraction failed" },
      { status: 500 }
    );
  } finally {
    if (mediaCleanup) {
      await mediaCleanup();
    }
    if (outDir) {
      await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
