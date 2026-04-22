import { randomUUID } from "node:crypto";

import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { parseSupportedVideoUrl } from "@/lib/url/allowed-source";

export const dynamic = "force-dynamic";

/**
 * US-04-style: accept a public video URL; job is queued (worker downloads with yt-dlp later).
 */
export async function POST(
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("url" in body)) {
    return NextResponse.json(
      { error: "url is required" },
      { status: 400 }
    );
  }
  const urlRaw = (body as { url: unknown }).url;
  if (typeof urlRaw !== "string") {
    return NextResponse.json({ error: "url must be a string" }, { status: 400 });
  }
  const urlCheck = parseSupportedVideoUrl(urlRaw);
  if (!urlCheck.ok) {
    return NextResponse.json(
      { error: urlCheck.reason },
      { status: 422 }
    );
  }
  const jobId = randomUUID();
  const now = new Date();
  const [job] = await db
    .insert(jobs)
    .values({
      id: jobId,
      projectId: project.id,
      userId: auth.user.sub,
      jobType: "ingest",
      status: "queued",
      sourceUrl: urlCheck.href,
    })
    .returning({ id: jobs.id, createdAt: jobs.createdAt });
  if (!job) {
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
  await db
    .update(projects)
    .set({ status: "processing", updatedAt: now })
    .where(eq(projects.id, project.id));
  return NextResponse.json(
    {
      jobId: job.id,
      source: urlCheck.kind,
      queuedAt: job.createdAt,
    },
    { status: 202 }
  );
}
