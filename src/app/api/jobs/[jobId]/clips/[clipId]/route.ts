import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";
import { putProcessedJson } from "@/lib/storage/put-processed-json";

type ClipEntry = {
  clipId: string;
  start: number;
  end: number;
  score: number;
  transcript_excerpt: string;
  suggested_title: string;
  selected?: boolean;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
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
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, auth.user.sub)))
    .limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "analysis_complete" && job.status !== "clips_ready") {
    return NextResponse.json({ error: "Clips are not ready yet" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const selected = (body as { selected?: unknown })?.selected;
  if (typeof selected !== "boolean") {
    return NextResponse.json(
      { error: "selected boolean is required" },
      { status: 400 }
    );
  }

  let manifest: { clips?: ClipEntry[] };
  try {
    manifest = JSON.parse(await getProcessedJsonString(jobId, "clip_manifest.json")) as {
      clips?: ClipEntry[];
    };
  } catch {
    return NextResponse.json(
      { error: "Clip manifest missing or unreadable" },
      { status: 404 }
    );
  }

  const clips = (manifest.clips ?? []).map((c) => ({ ...c, selected: c.selected ?? true }));
  const idx = clips.findIndex((c) => c.clipId === clipId);
  if (idx < 0) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  clips[idx] = { ...clips[idx], selected };
  const selectedCount = clips.filter((c) => c.selected !== false).length;
  if (selectedCount < 1) {
    return NextResponse.json(
      { error: "At least one clip must remain selected" },
      { status: 409 }
    );
  }

  await putProcessedJson(
    jobId,
    "clip_manifest.json",
    JSON.stringify({ ...manifest, clips }, null, 2)
  );

  return NextResponse.json({
    ok: true,
    clipId,
    selected,
    selectedCount,
  });
}
