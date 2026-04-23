import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedBinary } from "@/lib/storage/get-processed-binary";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";
import { downloadObjectToTempFile } from "@/lib/storage/download-object-temp";
import { putProcessedBinary } from "@/lib/storage/put-processed-binary";
import { extractFrameJpegAtSecond } from "@/lib/transcription/ffmpeg-frame";
import { downloadSourceUrlToTempFile } from "@/lib/transcription/download-source-url-temp";

type ClipEntry = {
  clipId: string;
  start: number;
  end: number;
  score: number;
  transcript_excerpt: string;
  suggested_title: string;
  selected?: boolean;
};

const FFMPEG_BIN = process.env.FFMPEG_PATH?.trim();

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

  const manifest = JSON.parse(
    await getProcessedJsonString(jobId, "clip_manifest.json")
  ) as { clips?: ClipEntry[] };
  const clip = (manifest.clips ?? []).find((c) => c.clipId === clipId);
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  try {
    const prebuilt = await getProcessedBinary(jobId, `thumbnails/${clip.clipId}.jpg`);
    return new NextResponse(new Uint8Array(prebuilt), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch {
    // fallback to on-demand rendering for older jobs
  }

  let mediaCleanup: (() => Promise<void>) | null = null;
  let frameDir = "";
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

    frameDir = await mkdtemp(join(tmpdir(), "vc-thumb-"));
    const framePath = join(frameDir, `${clip.clipId}.jpg`);
    const midpoint = (clip.start + clip.end) / 2;
    const jpg = await extractFrameJpegAtSecond(dl.mediaPath, framePath, midpoint, {
      ffmpegBin: FFMPEG_BIN,
    });
    await putProcessedBinary(jobId, `thumbnails/${clip.clipId}.jpg`, jpg, "image/jpeg");
    return new NextResponse(new Uint8Array(jpg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "Thumbnail generation failed" }, { status: 500 });
  } finally {
    if (mediaCleanup) {
      await mediaCleanup();
    }
    if (frameDir) {
      await rm(frameDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
