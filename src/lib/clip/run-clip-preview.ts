import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";

import { eq } from "drizzle-orm";

import type { ClipManifest, ClipManifestEntry } from "@/lib/analysis/analysis-types";
import { parseStoredTranscriptJson } from "@/lib/analysis/parse-stored-transcript";
import { wordsToAssForClip } from "@/lib/clip/words-to-ass";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { getProcessedJsonString } from "@/lib/storage/get-processed-json";
import { getTranscriptJsonString } from "@/lib/storage/get-transcript-json";
import { putProcessedBinary } from "@/lib/storage/put-processed-binary";
import { putProcessedJson } from "@/lib/storage/put-processed-json";
import { downloadObjectToTempFile } from "@/lib/storage/download-object-temp";
import { downloadSourceUrlToTempFile } from "@/lib/transcription/download-source-url-temp";
import type { StoredTranscript } from "@/lib/transcription/transcript-types";
import { publishClipPreviewEvent } from "@/lib/jobs/clip-preview-events";
const FFMPEG = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const PREVIEW_TIMEOUT_MS = 120_000;

function runFfmpegArgs(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FFmpeg preview timed out"));
    }, timeoutMs);
    child.stderr?.on("data", (b: Buffer) => {
      err += b.toString();
    });
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(err.trim() || `ffmpeg code ${code}`));
    });
  });
}

/**
 * `vf` ass filter on POSIX: paths use `/`; escape `:` for Windows drive letters only.
 */
function assFilterValue(assPath: string): string {
  return assPath.replace(/\\/g, "/");
}

function basePreviewArgs(input: string, t0: number, dur: number, outPath: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    `${t0}`,
    "-i",
    input,
    "-t",
    `${dur}`,
    "-c:v",
    "libx264",
    "-crf",
    "30",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

type EmitCtx = { userId: string; projectId: string };

/**
 * Produces a fast, low-bitrate h264/aac MP4 for editor preview, stored as
 * `processed/{jobId}/clips/{clipId}/preview.mp4`.
 */
export async function runClipPreviewRender(params: { jobId: string; clipId: string }): Promise<void> {
  const { jobId, clipId } = params;
  const [job] = await db
    .select({
      objectKey: jobs.objectKey,
      sourceUrl: jobs.sourceUrl,
      userId: jobs.userId,
      projectId: jobs.projectId,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) {
    return;
  }
  const baseEmit: EmitCtx = { userId: job.userId, projectId: job.projectId };

  const send = (ok: boolean) => {
    publishClipPreviewEvent({
      event: "clip:preview_ready",
      jobId,
      clipId,
      projectId: baseEmit.projectId,
      userId: baseEmit.userId,
      ok,
    });
  };

  let mediaCleanup: (() => Promise<void>) | null = null;
  let workDir = "";
  try {
    const raw = await getProcessedJsonString(jobId, "clip_manifest.json");
    const manifest = JSON.parse(raw) as ClipManifest;
    const clip = (manifest.clips ?? []).find((c) => c.clipId === clipId);
    if (!clip) {
      send(false);
      return;
    }

    const t0 = clip.start;
    const t1 = clip.end;
    const dur = t1 - t0;
    if (dur < 0.1) {
      send(false);
      return;
    }

    const tJson = await getTranscriptJsonString(jobId);
    const tr: StoredTranscript = parseStoredTranscriptJson(tJson);
    const ass = wordsToAssForClip(tr.words, t0, t1);
    workDir = await mkdtemp(join(tmpdir(), "vc-prev-"));
    const outPath = join(workDir, "preview.mp4");
    const assPath = join(workDir, "cap.ass");
    if (ass) {
      await writeFile(assPath, ass, "utf8");
    }

    const dl = job.objectKey
      ? await downloadObjectToTempFile(job.objectKey)
      : job.sourceUrl
        ? await downloadSourceUrlToTempFile(job.sourceUrl)
        : null;
    if (!dl) {
      throw new Error("No media for preview");
    }
    mediaCleanup = dl.cleanup;
    const input = dl.mediaPath;

    if (ass) {
      const vf = `ass=${assFilterValue(assPath)}`;
      try {
        await runFfmpegArgs(
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            `${t0}`,
            "-i",
            input,
            "-t",
            `${dur}`,
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-crf",
            "30",
            "-preset",
            "veryfast",
            "-tune",
            "fastdecode",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            outPath,
          ],
          PREVIEW_TIMEOUT_MS
        );
      } catch (e) {
        console.warn("[runClipPreviewRender] ass overlay failed; retrying without captions", e);
        await runFfmpegArgs(basePreviewArgs(input, t0, dur, outPath), PREVIEW_TIMEOUT_MS);
      }
    } else {
      await runFfmpegArgs(basePreviewArgs(input, t0, dur, outPath), PREVIEW_TIMEOUT_MS);
    }

    const bytes = await readFile(outPath);
    await putProcessedBinary(
      jobId,
      `clips/${clipId}/preview.mp4`,
      bytes,
      "video/mp4"
    );

    const clips = (manifest.clips ?? []) as (ClipManifestEntry & { preview_ready?: boolean })[];
    const next = clips.map((c) => (c.clipId === clipId ? { ...c, preview_ready: true } : c));
    await putProcessedJson(
      jobId,
      "clip_manifest.json",
      JSON.stringify({ ...manifest, clips: next }, null, 2)
    );

    send(true);
  } catch (e) {
    console.error("[runClipPreviewRender]", e);
    send(false);
    throw e;
  } finally {
    if (mediaCleanup) {
      await mediaCleanup();
    }
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
