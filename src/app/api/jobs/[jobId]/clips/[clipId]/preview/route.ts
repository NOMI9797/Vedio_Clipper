import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedBinary } from "@/lib/storage/get-processed-binary";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";

type ManClip = { clipId: string };

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
  ) as { clips?: ManClip[] };
  if (!(manifest.clips ?? []).some((c) => c.clipId === clipId)) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }
  try {
    const buf = await getProcessedBinary(jobId, `clips/${clipId}/preview.mp4`);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview not ready" }, { status: 404 });
  }
}
