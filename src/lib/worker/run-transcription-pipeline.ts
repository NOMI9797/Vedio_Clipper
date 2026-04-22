import { dirname, join } from "node:path";

import { and, asc, eq, isNotNull, or } from "drizzle-orm";

import { downloadObjectToTempFile } from "@/lib/storage/download-object-temp";
import { putTranscriptJson } from "@/lib/storage/put-transcript-json";
import { downloadSourceUrlToTempFile } from "@/lib/transcription/download-source-url-temp";
import { transcribeWavWithDeepgram } from "@/lib/transcription/deepgram";
import { extractWav16kMono } from "@/lib/transcription/ffmpeg-wav";
import { transcribeWavWithOpenAI } from "@/lib/transcription/openai-whisper";
import { db } from "@/lib/db";
import { jobs, projects, type Job } from "@/lib/db/schema";
import { publishJobStatusUpdate } from "@/lib/jobs/status-events";

const FFMPEG_BIN = process.env.FFMPEG_PATH?.trim();

const LOG = "[transcription:US-05]";
function logStep(step: string, detail?: string): void {
  if (detail) {
    console.info(`${LOG} ${step} — ${detail}`);
  } else {
    console.info(`${LOG} ${step}`);
  }
}

function pickTranscriber():
  | { kind: "deepgram"; key: string }
  | { kind: "openai"; key: string } {
  const prefer = (process.env.TRANSCRIPTION_PROVIDER ?? "deepgram")
    .trim()
    .toLowerCase();
  const dg = process.env.DEEPGRAM_API_KEY?.trim();
  const oa = process.env.OPENAI_API_KEY?.trim();
  if (prefer === "openai" && oa) {
    return { kind: "openai", key: oa };
  }
  if (dg) {
    return { kind: "deepgram", key: dg };
  }
  if (oa) {
    return { kind: "openai", key: oa };
  }
  throw new Error(
    "Set DEEPGRAM_API_KEY or OPENAI_API_KEY (and optional TRANSCRIPTION_PROVIDER=deepgram|openai)"
  );
}

export async function processNextTranscriptionJob(): Promise<{
  ran: boolean;
  jobId?: string;
  error?: string;
}> {
  const [next] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "queued"),
        eq(jobs.jobType, "ingest"),
        or(isNotNull(jobs.objectKey), isNotNull(jobs.sourceUrl))
      )
    )
    .orderBy(asc(jobs.createdAt))
    .limit(1);
  if (!next || (!next.objectKey && !next.sourceUrl)) {
    return { ran: false };
  }

  logStep(
    "picked job",
    `id=${next.id} objectKey=${next.objectKey ?? "-"} sourceUrl=${next.sourceUrl ?? "-"}`
  );

  const [claimed] = await db
    .update(jobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
    .returning({ id: jobs.id });
  if (!claimed) {
    logStep("claim skipped (another worker took the job)", `id=${next.id}`);
    return { ran: false };
  }

  return runClaimedTranscriptionJob(next);
}

export async function processTranscriptionJobById(
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
  if (job.jobType !== "ingest") {
    return { ran: false, jobId, error: "Only ingest jobs can be transcribed" };
  }
  if (!job.objectKey && !job.sourceUrl) {
    return { ran: false, jobId, error: "Job has no media source" };
  }
  if (job.status === "transcript_complete") {
    return { ran: false, jobId, error: "Job already completed" };
  }
  if (job.status === "processing") {
    return { ran: false, jobId, error: "Job is already processing" };
  }
  const [claimed] = await db
    .update(jobs)
    .set({ status: "processing", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(jobs.id, job.id),
        or(eq(jobs.status, "queued"), eq(jobs.status, "failed"))
      )
    )
    .returning({ id: jobs.id });
  if (!claimed) {
    return {
      ran: false,
      jobId: job.id,
      error: "Could not claim job (status changed)",
    };
  }
  logStep("picked explicit job", `id=${job.id}`);
  return runClaimedTranscriptionJob(job);
}

async function runClaimedTranscriptionJob(next: Job): Promise<{
  ran: boolean;
  jobId?: string;
  error?: string;
}> {
  const jobId = next.id;
  const projectId = next.projectId;
  const now = new Date();

  const fail = async (message: string) => {
    console.error(`${LOG} FAILED job=${jobId}`, message);
    const updatedAt = new Date();
    await db
      .update(jobs)
      .set({
        status: "failed",
        error: message.slice(0, 4000),
        progress: 100,
        updatedAt,
      })
      .where(eq(jobs.id, jobId));
    publishJobStatusUpdate({
      event: "job:status_update",
      jobId,
      projectId,
      userId: next.userId,
      status: "failed",
      progress: 100,
      updatedAt: updatedAt.toISOString(),
      error: message.slice(0, 4000),
    });
    await db
      .update(projects)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  };

  let cleanup: (() => Promise<void>) | null = null;
  try {
    const processingAt = new Date();
    await db
      .update(jobs)
      .set({ progress: 5, error: null, updatedAt: processingAt })
      .where(eq(jobs.id, jobId));
    publishJobStatusUpdate({
      event: "job:status_update",
      jobId,
      projectId,
      userId: next.userId,
      status: "processing",
      progress: 5,
      updatedAt: processingAt.toISOString(),
      error: null,
    });
    logStep("status=processing", `job=${jobId}`);
    const engine = pickTranscriber();
    logStep("transcriber", engine.kind);

    let downloadResult:
      | Awaited<ReturnType<typeof downloadObjectToTempFile>>
      | Awaited<ReturnType<typeof downloadSourceUrlToTempFile>>;
    if (next.objectKey) {
      logStep("1/5 download object from storage", next.objectKey);
      downloadResult = await downloadObjectToTempFile(next.objectKey);
    } else if (next.sourceUrl) {
      logStep("1/5 download media from source URL", next.sourceUrl);
      downloadResult = await downloadSourceUrlToTempFile(next.sourceUrl);
    } else {
      throw new Error("Job has neither objectKey nor sourceUrl");
    }
    const { mediaPath, cleanup: c } = downloadResult;
    cleanup = c;
    await db
      .update(jobs)
      .set({ progress: 25, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    logStep("1/5 done", `localMedia=${mediaPath}`);

    const wav = join(dirname(mediaPath), "audio.wav");
    logStep(
      "2/5 ffmpeg → 16 kHz mono WAV",
      FFMPEG_BIN ? `binary=${FFMPEG_BIN}` : "binary=ffmpeg (PATH)"
    );
    await extractWav16kMono(mediaPath, wav, { ffmpegBin: FFMPEG_BIN });
    await db
      .update(jobs)
      .set({ progress: 45, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    logStep("2/5 done", `wav=${wav}`);

    logStep(
      "3/5 speech-to-text",
      engine.kind === "deepgram" ? "Deepgram" : "OpenAI whisper-1"
    );
    const transcript =
      engine.kind === "deepgram"
        ? await transcribeWavWithDeepgram(wav, engine.key)
        : await transcribeWavWithOpenAI(wav, engine.key);
    await db
      .update(jobs)
      .set({ progress: 75, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    logStep(
      "3/5 done",
      `language=${transcript.language} words=${transcript.words.length} segments=${transcript.segments.length}`
    );

    const body = JSON.stringify(
      { ...transcript, jobId, projectId, createdAt: now.toISOString() },
      null,
      2
    );
    const storageKey = `processed/${jobId}/transcript.json`;
    logStep("4/5 write transcript JSON to object storage", storageKey);
    await putTranscriptJson(jobId, body);
    await db
      .update(jobs)
      .set({ progress: 90, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    logStep("4/5 done", `${body.length} characters`);

    logStep("5/5 update database", "job=transcript_complete project=ready");
    const doneAt = new Date();
    await db
      .update(jobs)
      .set({
        status: "transcript_complete",
        progress: 100,
        error: null,
        updatedAt: doneAt,
      })
      .where(eq(jobs.id, jobId));
    publishJobStatusUpdate({
      event: "job:status_update",
      jobId,
      projectId,
      userId: next.userId,
      status: "transcript_complete",
      progress: 100,
      updatedAt: doneAt.toISOString(),
      error: null,
    });
    await db
      .update(projects)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    logStep("SUCCESS", `job=${jobId}`);
    return { ran: true, jobId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await fail(message);
    return { ran: true, jobId, error: message };
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

export async function runTranscriptionBatch(maxJobs: number): Promise<{
  processed: number;
  errors: string[];
}> {
  console.info(
    `${LOG} batch start — max=${maxJobs} (download → ffmpeg → stt → storage → db)`
  );
  const errors: string[] = [];
  let processed = 0;
  for (let i = 0; i < maxJobs; i += 1) {
    const r = await processNextTranscriptionJob();
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
