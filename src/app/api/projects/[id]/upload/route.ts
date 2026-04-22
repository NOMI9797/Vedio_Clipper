import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";

import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { putObjectToLocalDir } from "@/lib/storage/local-disc";
import { putObjectFromNodeStream } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";
import { MAX_VIDEO_BYTES, resolveVideoContentType } from "@/lib/upload/allowed-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function extForStoredFile(fileName: string, contentType: string): string {
  const fromName = path.extname(fileName).toLowerCase();
  if (fromName) {
    return fromName;
  }
  if (contentType === "video/mp4") {
    return ".mp4";
  }
  if (contentType === "video/quicktime") {
    return ".mov";
  }
  if (contentType === "video/webm") {
    return ".webm";
  }
  if (
    contentType === "video/mkv" ||
    contentType === "video/x-matrosska" ||
    contentType === "video/x-matroska"
  ) {
    return ".mkv";
  }
  return ".bin";
}

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
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing multipart field file" },
      { status: 400 }
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Invalid or empty file" },
      { status: 400 }
    );
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 2GB limit" },
      { status: 413 }
    );
  }
  const kind = resolveVideoContentType(
    file.type || "application/octet-stream",
    file.name
  );
  if (!kind.ok) {
    return NextResponse.json(
      { error: "Unsupported video type" },
      { status: 415 }
    );
  }
  const target = resolveUploadBackend();
  if (!target.ok) {
    return NextResponse.json({ error: target.message }, { status: 503 });
  }
  const jobId = randomUUID();
  const ext = extForStoredFile(file.name, kind.contentType);
  const key = `raw/${project.id}/${jobId}/original${ext}`;
  const body = Readable.fromWeb(
    file.stream() as import("node:stream/web").ReadableStream
  );
  try {
    if (target.backend.kind === "r2") {
      const { s3, config } = target.backend;
      await putObjectFromNodeStream(
        s3,
        config.bucket,
        key,
        body,
        kind.contentType,
        file.size
      );
    } else {
      await putObjectToLocalDir(target.backend.rootDir, key, body);
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to store file" },
      { status: 502 }
    );
  }
  const [job] = await db
    .insert(jobs)
    .values({
      id: jobId,
      projectId: project.id,
      userId: auth.user.sub,
      jobType: "ingest",
      status: "queued",
      objectKey: key,
    })
    .returning({ id: jobs.id, createdAt: jobs.createdAt });
  if (!job) {
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
  const now = new Date();
  await db
    .update(projects)
    .set({ status: "processing", updatedAt: now })
    .where(eq(projects.id, project.id));
  return NextResponse.json(
    { jobId: job.id, uploadedAt: job.createdAt },
    { status: 201 }
  );
}
