import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import {
  processTranscriptionJobById,
  runTranscriptionBatch,
} from "@/lib/worker/run-transcription-pipeline";

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
 * US-05 worker: run transcription pipeline (FFmpeg + Deepgram/OpenAI).
 * Auth: either `x-worker-secret: WORKER_SECRET` (cron/automation) **or** logged-in
 * `Authorization: Bearer <access token>` (in-app "Run transcription" button).
 * Query: `?max=5` (jobs per request, 1–20).
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
    const result = await processTranscriptionJobById(jobId, userId);
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
  const max = Number.isNaN(raw)
    ? 5
    : Math.min(20, Math.max(1, raw));
  const result = await runTranscriptionBatch(max);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return run(request);
}

/** Vercel-style cron often uses GET */
export async function GET(request: Request) {
  return run(request);
}
