import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";
import { getTranscriptJsonString } from "@/lib/storage/get-transcript-json";
import { isUuid } from "@/lib/http/uuid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Download stored transcript JSON (US-05). Query: `?jobId=uuid`
 */
export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const projectId = context.params.id;
  if (!isUuid(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !isUuid(jobId)) {
    return NextResponse.json(
      { error: "jobId query (uuid) is required" },
      { status: 400 }
    );
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, auth.user.sub))
    )
    .limit(1);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.projectId, projectId)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const canRead =
    job.status === "transcript_complete" ||
    job.status === "analysis_complete" ||
    job.status === "clips_ready";
  if (!canRead) {
    return NextResponse.json(
      { error: "Transcript not available for this job status" },
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[transcript] read failed", jobId, msg);
    return NextResponse.json(
      { error: "Transcript file missing or could not be read" },
      { status: 404 }
    );
  }
}
