import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import {
  processAnalysisJobById,
  runAnalysisBatch,
} from "@/lib/worker/run-analysis-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isWorkerSecretValid(request: Request): boolean {
  const secret = process.env.WORKER_SECRET?.trim();
  if (!secret) {
    return false;
  }
  return request.headers.get("x-worker-secret") === secret;
}

/**
 * US-07 + US-08: read transcript, write analysis.json and clip_manifest.json, status clips_ready.
 * Auth: `x-worker-secret` or Bearer (same as transcribe worker).
 */
async function run(request: Request) {
  let userId: string | undefined;
  if (!isWorkerSecretValid(request)) {
    const auth = await requireBearer(request);
    if (!auth.ok) {
      return auth.response;
    }
    userId = auth.user.sub;
  }
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  if (jobId) {
    const result = await processAnalysisJobById(jobId, userId);
    if (result.error && !result.ran) {
      return NextResponse.json(
        { ok: false, ...result },
        { status: result.error === "Job not found" ? 404 : 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      processed: result.ran ? 1 : 0,
      errors: result.error ? [`${result.jobId ?? jobId}: ${result.error}`] : [],
      jobId: result.jobId ?? jobId,
    });
  }
  const raw = Number.parseInt(url.searchParams.get("max") ?? "5", 10);
  const max = Number.isNaN(raw) ? 5 : Math.min(20, Math.max(1, raw));
  const out = await runAnalysisBatch(max);
  return NextResponse.json({ ok: true, ...out });
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
