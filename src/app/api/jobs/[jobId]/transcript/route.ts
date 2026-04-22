import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getTranscriptJsonString } from "@/lib/storage/get-transcript-json";

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
      progress: jobs.progress,
      updatedAt: jobs.updatedAt,
      error: jobs.error,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, auth.user.sub)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "failed") {
    return NextResponse.json(
      {
        status: "failed",
        progress: job.progress,
        updatedAt: job.updatedAt,
        error: humanizeJobError(job.error),
      },
      { status: 409 }
    );
  }
  if (job.status !== "transcript_complete") {
    return NextResponse.json(
      {
        status: job.status,
        progress: job.progress,
        updatedAt: job.updatedAt,
        error: "Transcript is not ready yet.",
      },
      { status: 409 }
    );
  }

  try {
    const json = await getTranscriptJsonString(jobId);
    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Transcript file missing or could not be read" },
      { status: 404 }
    );
  }
}

function humanizeJobError(raw: string | null): string {
  if (!raw) {
    return "Job failed due to an internal processing error.";
  }
  if (raw.includes("yt-dlp")) {
    return "Could not download media from the link. Please verify the URL and try again.";
  }
  if (raw.includes("ffmpeg")) {
    return "Audio extraction failed while processing this media.";
  }
  return "Transcription failed while processing this job. Please try again.";
}
