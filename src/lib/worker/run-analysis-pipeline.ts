import { and, asc, eq } from "drizzle-orm";

import { buildClipManifest } from "@/lib/analysis/clip-manifest";
import type { AnalysisResult, ClipManifest } from "@/lib/analysis/analysis-types";
import { parseStoredTranscriptJson } from "@/lib/analysis/parse-stored-transcript";
import { scoreTranscriptSegments } from "@/lib/analysis/segment-scoring";
import { downloadObjectToTempFile } from "@/lib/storage/download-object-temp";
import { putProcessedBinary } from "@/lib/storage/put-processed-binary";
import { getTranscriptJsonString } from "@/lib/storage/get-transcript-json";
import { putProcessedJson } from "@/lib/storage/put-processed-json";
import { extractFrameJpegAtSecond } from "@/lib/transcription/ffmpeg-frame";
import { extractFullSourceWaveformPeaks } from "@/lib/transcription/extract-waveform-peaks";
import { downloadSourceUrlToTempFile } from "@/lib/transcription/download-source-url-temp";
import { requestClipPreviewRender } from "@/lib/clip/queue-clip-preview";
import { db } from "@/lib/db";
import { jobs, projects, type Job } from "@/lib/db/schema";
import { publishJobStatusUpdate } from "@/lib/jobs/status-events";

const LOG = "[analysis:US-07-08]";
const ANALYSIS_BUDGET_MS = 3 * 60 * 1000;
const FFMPEG_BIN = process.env.FFMPEG_PATH?.trim();

function logStep(step: string, detail?: string): void {
  if (detail) {
    console.info(`${LOG} ${step} — ${detail}`);
  } else {
    console.info(`${LOG} ${step}`);
  }
}

function checkBudget(start: number): void {
  if (Date.now() - start > ANALYSIS_BUDGET_MS) {
    throw new Error(
      "Analysis exceeded 3 minute budget (source may be too long)"
    );
  }
}

export async function runAnalysisForJob(job: Job): Promise<void> {
  const jobId = job.id;
  const projectId = job.projectId;
  const t0 = Date.now();
  checkBudget(t0);

  logStep("start", `job=${jobId}`);

  let analysisAt = new Date();
  let mediaForThumbs: Awaited<ReturnType<typeof downloadObjectToTempFile>> | null = null;
  try {
    logStep("1/5 read transcript.json", `job=${jobId}`);
    const raw = await getTranscriptJsonString(jobId);
    checkBudget(t0);
    const transcript = parseStoredTranscriptJson(raw);
    logStep(
      "1/5 done",
      `segments=${transcript.segments.length} words=${transcript.words.length} provider=${transcript.provider}`
    );

    logStep("2/5 score segments", "pace+hook+semantic+sentiment+boundary");
    const analysis = await scoreTranscriptSegments(jobId, transcript);
    checkBudget(t0);
    const topSeg = [...analysis.segments]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => `${s.index}:${(s.score * 100).toFixed(1)}%`)
      .join(", ");
    logStep(
      "2/5 done",
      `segments=${analysis.segments.length} embeddings=${analysis.semanticWithEmbeddings ? "openai" : "tfidf"} top=[${topSeg}]`
    );

    try {
      mediaForThumbs = job.objectKey
        ? await downloadObjectToTempFile(job.objectKey)
        : job.sourceUrl
          ? await downloadSourceUrlToTempFile(job.sourceUrl)
          : null;
    } catch (e) {
      logStep("media download (waveform)", e instanceof Error ? e.message : String(e));
    }

    if (mediaForThumbs) {
      try {
        checkBudget(t0);
        logStep("2.5/5 waveform peaks", "ffmpeg f32le");
        const wf = await extractFullSourceWaveformPeaks(mediaForThumbs.mediaPath, {
          ffmpegBin: FFMPEG_BIN,
          samplesPerSec: 10,
        });
        (analysis as AnalysisResult).waveformPeaks = wf.peaks;
        (analysis as AnalysisResult).waveformSamplesPerSec = wf.samplesPerSec;
        logStep("2.5/5 done", `peaks=${wf.peaks.length} spc=${wf.samplesPerSec}`);
      } catch (e) {
        logStep(
          "2.5/5 waveform skipped",
          e instanceof Error ? e.message : String(e)
        );
      }
    }

    logStep("3/5 write analysis.json", `processed/${jobId}/analysis.json`);
    await putProcessedJson(
      jobId,
      "analysis.json",
      JSON.stringify(analysis, null, 2)
    );
    logStep("3/5 done", `bytes=${JSON.stringify(analysis).length}`);

    analysisAt = new Date();
    await db
      .update(jobs)
      .set({
        status: "analysis_complete",
        progress: 85,
        error: null,
        updatedAt: analysisAt,
      })
      .where(eq(jobs.id, jobId));
    publishJobStatusUpdate({
      event: "job:status_update",
      jobId,
      projectId,
      userId: job.userId,
      status: "analysis_complete",
      progress: 85,
      updatedAt: analysisAt.toISOString(),
      error: null,
    });
    logStep("4/5 status update", "job=analysis_complete progress=85");

    checkBudget(t0);
    logStep("5/6 build clip manifest", "merge+duration+length-penalty+title");
    const manifest = buildClipManifest(
      jobId,
      analysis.segments,
      analysis.sourceDurationSec
    );
    await putProcessedJson(
      jobId,
      "clip_manifest.json",
      JSON.stringify(manifest, null, 2)
    );
    const topClip = [...manifest.clips]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 3)
      .map(
        (c) =>
          `${((c.score ?? 0) * 100).toFixed(1)}% [${c.start.toFixed(1)}-${c.end.toFixed(
            1
          )}]`
      )
      .join(", ");
    logStep(
      "5/6 done",
      `clips=${manifest.clips.length} top=[${topClip}] key=processed/${jobId}/clip_manifest.json`
    );

    checkBudget(t0);
    logStep("6/6 pre-render thumbnails", `clips=${manifest.clips.length}`);
    const thumbCount = await preRenderClipThumbnails(job, manifest, t0, mediaForThumbs);
    logStep("6/6 done", `thumbnails=${thumbCount}`);

    for (let i = 0; i < manifest.clips.length; i += 1) {
      const c = manifest.clips[i]!;
      const delay = 400 * (i + 1);
      setTimeout(() => {
        requestClipPreviewRender(jobId, c.clipId);
      }, delay);
    }
    if (manifest.clips.length > 0) {
      logStep("preview queue", `scheduled n=${manifest.clips.length} (staggered)`);
    }

    const readyAt = new Date();
    await db
      .update(jobs)
      .set({
        status: "clips_ready",
        progress: 100,
        error: null,
        updatedAt: readyAt,
      })
      .where(eq(jobs.id, jobId));
    publishJobStatusUpdate({
      event: "job:status_update",
      jobId,
      projectId,
      userId: job.userId,
      status: "clips_ready",
      progress: 100,
      updatedAt: readyAt.toISOString(),
      error: null,
    });

    await db
      .update(projects)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    logStep("SUCCESS", `job=${jobId} ms=${Date.now() - t0}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failAnalysisJob(job, message);
    throw e;
  } finally {
    if (mediaForThumbs) {
      await mediaForThumbs.cleanup().catch(() => undefined);
    }
  }
}

async function preRenderClipThumbnails(
  job: Job,
  manifest: ClipManifest,
  t0: number,
  existingMedia: Awaited<ReturnType<typeof downloadObjectToTempFile>> | null
): Promise<number> {
  if (manifest.clips.length === 0) {
    return 0;
  }
  const dl =
    existingMedia ??
    (job.objectKey
      ? await downloadObjectToTempFile(job.objectKey)
      : job.sourceUrl
        ? await downloadSourceUrlToTempFile(job.sourceUrl)
        : null);
  if (!dl) {
    throw new Error("No media source found for thumbnail pre-render");
  }
  const shouldCleanup = !existingMedia;
  let created = 0;
  try {
    for (const clip of manifest.clips) {
      checkBudget(t0);
      const midpoint = (clip.start + clip.end) / 2;
      const out = `${dl.workDir}/${clip.clipId}.jpg`;
      const jpg = await extractFrameJpegAtSecond(dl.mediaPath, out, midpoint, {
        ffmpegBin: FFMPEG_BIN,
      });
      await putProcessedBinary(job.id, `thumbnails/${clip.clipId}.jpg`, jpg, "image/jpeg");
      created += 1;
    }
  } finally {
    if (shouldCleanup) {
      await dl.cleanup();
    }
  }
  return created;
}

async function failAnalysisJob(job: Job, message: string): Promise<void> {
  const updatedAt = new Date();
  console.error(`${LOG} FAILED job=${job.id}`, message);
  await db
    .update(jobs)
    .set({
      status: "failed",
      error: message.slice(0, 4000),
      progress: 100,
      updatedAt,
    })
    .where(eq(jobs.id, job.id));
  publishJobStatusUpdate({
    event: "job:status_update",
    jobId: job.id,
    projectId: job.projectId,
    userId: job.userId,
    status: "failed",
    progress: 100,
    updatedAt: updatedAt.toISOString(),
    error: message.slice(0, 4000),
  });
  await db
    .update(projects)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(projects.id, job.projectId));
}

export async function processNextAnalysisJob(): Promise<{
  ran: boolean;
  jobId?: string;
  error?: string;
}> {
  const [next] = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.status, "transcript_complete"), eq(jobs.jobType, "ingest"))
    )
    .orderBy(asc(jobs.createdAt))
    .limit(1);
  if (!next) {
    return { ran: false };
  }

  const [claimed] = await db
    .update(jobs)
    .set({
      status: "processing",
      progress: 2,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(jobs.id, next.id), eq(jobs.status, "transcript_complete"))
    )
    .returning({ id: jobs.id });
  if (!claimed) {
    return { ran: false };
  }

  const job = next;
  const jobId = job.id;
  try {
    await runAnalysisForJob(job);
    return { ran: true, jobId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ran: true, jobId, error: message };
  }
}

export async function processAnalysisJobById(
  jobId: string,
  userId?: string
): Promise<{
  ran: boolean;
  jobId?: string;
  error?: string;
}> {
  const where = userId
    ? and(eq(jobs.id, jobId), eq(jobs.userId, userId))
    : eq(jobs.id, jobId);
  const [job] = await db.select().from(jobs).where(where).limit(1);
  if (!job) {
    return { ran: false, jobId, error: "Job not found" };
  }
  if (job.status !== "transcript_complete") {
    if (job.status === "clips_ready" || job.status === "analysis_complete") {
      return { ran: false, jobId, error: "Analysis already done for this job" };
    }
    return {
      ran: false,
      jobId,
      error: "Transcript must be complete before analysis",
    };
  }

  const [claimed] = await db
    .update(jobs)
    .set({
      status: "processing",
      progress: 2,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(jobs.id, job.id), eq(jobs.status, "transcript_complete"))
    )
    .returning({ id: jobs.id });
  if (!claimed) {
    return { ran: false, jobId, error: "Could not claim job (status changed)" };
  }

  try {
    await runAnalysisForJob(job);
    return { ran: true, jobId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ran: true, jobId, error: message };
  }
}

export async function runAnalysisBatch(maxJobs: number): Promise<{
  processed: number;
  errors: string[];
}> {
  console.info(
    `${LOG} batch start — max=${maxJobs} (transcript → analysis.json → clip_manifest.json)`
  );
  const errors: string[] = [];
  let processed = 0;
  for (let i = 0; i < maxJobs; i += 1) {
    const r = await processNextAnalysisJob();
    if (!r.ran) {
      break;
    }
    processed += 1;
    if (r.error) {
      errors.push(`${r.jobId ?? "?"}: ${r.error}`);
    }
  }
  console.info(
    `${LOG} batch done — processed=${processed} errorCount=${errors.length}`
  );
  return { processed, errors };
}
