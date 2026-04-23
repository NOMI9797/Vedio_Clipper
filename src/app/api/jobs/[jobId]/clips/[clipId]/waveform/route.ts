import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";

import type { AnalysisResult } from "@/lib/analysis/analysis-types";

type ManifestClip = { clipId: string };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: { jobId: string; clipId: string } }
) {
  const { jobId, clipId } = context.params;
  if (!isUuid(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const auth = await requireBearer(_request);
  if (!auth.ok) {
    return auth.response;
  }
  const [job] = await db
    .select({ status: jobs.status })
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
  ) as { clips?: ManifestClip[] };
  const inManifest = (manifest.clips ?? []).some((c) => c.clipId === clipId);
  if (!inManifest) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  let analysis: AnalysisResult;
  try {
    analysis = JSON.parse(
      await getProcessedJsonString(jobId, "analysis.json")
    ) as AnalysisResult;
  } catch {
    return NextResponse.json(
      { error: "Analysis data missing" },
      { status: 404 }
    );
  }
  const peaks = analysis.waveformPeaks;
  if (!peaks || peaks.length === 0) {
    return NextResponse.json(
      { error: "no_waveform", detail: "Precomputed peaks not in analysis.json" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    peaks,
    durationSec: analysis.sourceDurationSec,
    samplesPerSec: analysis.waveformSamplesPerSec ?? 10,
  });
}
