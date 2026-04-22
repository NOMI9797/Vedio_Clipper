import { desc, eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";

export const dynamic = "force-dynamic";

const JOB_LIST_LIMIT = 50;

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
  const jobRows = await db
    .select({
      id: jobs.id,
      jobType: jobs.jobType,
      status: jobs.status,
      progress: jobs.progress,
      objectKey: jobs.objectKey,
      sourceUrl: jobs.sourceUrl,
      error: jobs.error,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(eq(jobs.projectId, projectId))
    .orderBy(desc(jobs.createdAt))
    .limit(JOB_LIST_LIMIT);
  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    jobs: jobRows,
  });
}
