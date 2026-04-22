import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Extract 16 kHz mono 16-bit PCM WAV (Whisper / STT friendly).
 */
export function extractWav16kMono(
  inputVideoPath: string,
  outputWavPath: string,
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
      "-i",
      inputVideoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputWavPath,
    ];
    const child = spawn(ffmpeg, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms`));
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
