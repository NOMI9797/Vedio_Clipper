import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const DEFAULT_TIMEOUT_MS = 60_000;

export async function extractFrameJpegAtSecond(
  inputVideoPath: string,
  outputJpegPath: string,
  second: number,
  options?: { ffmpegBin?: string; timeoutMs?: number }
): Promise<Buffer> {
  const ffmpeg = options?.ffmpegBin?.trim() || "ffmpeg";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t = Math.max(0, second);

  await new Promise<void>((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      `${t}`,
      "-i",
      inputVideoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputJpegPath,
    ];
    const child = spawn(ffmpeg, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`FFmpeg frame extraction timed out after ${timeoutMs}ms`));
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

  return readFile(outputJpegPath);
}
