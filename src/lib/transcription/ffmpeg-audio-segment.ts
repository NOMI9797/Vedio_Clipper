import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Extract mono PCM WAV for [fromSec, fromSec + durationSec] from a media file.
 */
export function extractWavSegment(
  inputPath: string,
  outputWavPath: string,
  fromSec: number,
  durationSec: number,
  options?: { ffmpegBin?: string; timeoutMs?: number }
): Promise<void> {
  const ffmpeg = options?.ffmpegBin?.trim() || "ffmpeg";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      `${Math.max(0, fromSec)}`,
      "-i",
      inputPath,
      "-t",
      `${Math.max(0.1, durationSec)}`,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-c:a",
      "pcm_s16le",
      outputWavPath,
    ];
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`FFmpeg audio segment timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr?.on("data", (ch: Buffer) => {
      stderr += ch.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });
}
