import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClipEntry = {
  clipId: string;
  start: number;
  end: number;
  score: number;
  transcript_excerpt: string;
  suggested_title: string;
  selected?: boolean;
};

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
      clips?: ClipEntry[];
    };
    const clips = (manifest.clips ?? [])
      .map((c) => ({ ...c, selected: c.selected ?? true }))
      .sort((a, b) => b.score - a.score);
    return NextResponse.json(clips);
  } catch {
    return NextResponse.json(
      { error: "AI result files missing or unreadable" },
      { status: 404 }
    );
  }
}
