import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { clipExcerptFromAnalysisSegments } from "@/lib/analysis/clip-excerpt";
import type { AnalysisResult, ClipManifestEntry } from "@/lib/analysis/analysis-types";
import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/http/uuid";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";
import { putProcessedJson } from "@/lib/storage/put-processed-json";
import { requestClipPreviewRender } from "@/lib/clip/queue-clip-preview";

const MIN_USER_CLIP_SEC = 10;
const MAX_USER_CLIP_SEC = 90;

type ManifestShape = { clips?: ClipManifestEntry[] };

function normalizeClips(
  list: ClipManifestEntry[] | undefined
): (ClipManifestEntry & { selected: boolean })[] {
  return (list ?? []).map((c) => ({
    ...c,
    selected: c.selected ?? true,
  }));
}

function isDatabaseUnreachable(e: unknown): boolean {
  if (e == null || typeof e !== "object") {
    return false;
  }
  const c = (e as { code?: string }).code;
  if (c && ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(c)) {
    return true;
  }
  const m = (e as { message?: string }).message ?? String(e);
  return /getaddrinfo|ECONNREFUSED|ETIMEDOUT|connect ECONNREFUSED/i.test(m);
}

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const o = body as { selected?: unknown; start?: unknown; end?: unknown };
  const hasSelected = "selected" in o;
  const hasStart = o.start !== undefined;
  const hasEnd = o.end !== undefined;
  if (!hasSelected && !hasStart && !hasEnd) {
    return NextResponse.json(
      { error: "Provide selected and/or { start, end }" },
      { status: 400 }
    );
  }
  if (hasStart !== hasEnd) {
    return NextResponse.json(
      { error: "Both start and end are required to adjust in/out" },
      { status: 400 }
    );
  }
  if (hasSelected && typeof o.selected !== "boolean") {
    return NextResponse.json({ error: "selected must be a boolean" }, { status: 400 });
  }
  let newStart: number | undefined;
  let newEnd: number | undefined;
  if (hasStart && hasEnd) {
    if (typeof o.start !== "number" || typeof o.end !== "number") {
      return NextResponse.json(
        { error: "start and end must be numbers" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(o.start) || !Number.isFinite(o.end)) {
      return NextResponse.json(
        { error: "start and end must be finite" },
        { status: 400 }
      );
    }
    newStart = o.start;
    newEnd = o.end;
  }

  try {
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

    let manifest: ManifestShape;
    try {
      manifest = JSON.parse(
        await getProcessedJsonString(jobId, "clip_manifest.json")
      ) as ManifestShape;
    } catch {
      return NextResponse.json(
        { error: "Clip manifest missing or unreadable" },
        { status: 404 }
      );
    }

    const clips = normalizeClips(manifest.clips);
    const idx = clips.findIndex((c) => c.clipId === clipId);
    if (idx < 0) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    let analysis: AnalysisResult;
    try {
      analysis = JSON.parse(
        await getProcessedJsonString(jobId, "analysis.json")
      ) as AnalysisResult;
    } catch {
      return NextResponse.json(
        { error: "Analysis data missing; cannot adjust clip bounds" },
        { status: 409 }
      );
    }
    const sourceMax = Math.max(0, analysis.sourceDurationSec ?? 0);

    if (newStart !== undefined && newEnd !== undefined) {
      if (newStart < 0 || newEnd > sourceMax) {
        return NextResponse.json(
          { error: `Clip must stay within 0 and source length (${sourceMax.toFixed(2)}s)` },
          { status: 400 }
        );
      }
      if (newEnd <= newStart) {
        return NextResponse.json({ error: "end must be after start" }, { status: 400 });
      }
      const dur = newEnd - newStart;
      if (dur < MIN_USER_CLIP_SEC || dur > MAX_USER_CLIP_SEC) {
        return NextResponse.json(
          {
            error: `Clip duration must be between ${MIN_USER_CLIP_SEC}s and ${MAX_USER_CLIP_SEC}s`,
          },
          { status: 400 }
        );
      }
    }

    const before = clips[idx];
    let next: typeof before = { ...before };

    if (hasSelected) {
      next = { ...next, selected: o.selected as boolean };
    }
    if (newStart !== undefined && newEnd !== undefined) {
      const excerpt = clipExcerptFromAnalysisSegments(
        analysis.segments,
        newStart,
        newEnd
      );
      next = {
        ...next,
        start: newStart,
        end: newEnd,
        transcript_excerpt: excerpt || before.transcript_excerpt,
        edited: true,
        preview_ready: false,
      };
    }

    if (next.selected === false) {
      const otherSelected = clips.some((c, i) => i !== idx && c.selected !== false);
      if (!otherSelected) {
        return NextResponse.json(
          { error: "At least one clip must remain selected" },
          { status: 409 }
        );
      }
    }

    const updated = [...clips];
    updated[idx] = next;
    const selectedCount = updated.filter((c) => c.selected !== false).length;

    await putProcessedJson(
      jobId,
      "clip_manifest.json",
      JSON.stringify({ ...manifest, clips: updated }, null, 2)
    );

    if (newStart !== undefined && newEnd !== undefined) {
      requestClipPreviewRender(jobId, clipId);
    }

    return NextResponse.json({
      ok: true,
      clipId,
      clip: next,
      selectedCount,
    });
  } catch (e) {
    if (isDatabaseUnreachable(e)) {
      return NextResponse.json(
        {
          error:
            "Database unreachable. Check DATABASE_URL, your network, and that the Neon (or other Postgres) project is online.",
        },
        { status: 503 }
      );
    }
    console.error("[PATCH /jobs/.../clips/...]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
