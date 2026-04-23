import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export type WaveformExtraction = {
  /** Amplitude 0–1, ~`samplesPerSec` points per second of source. */
  peaks: number[];
  samplesPerSec: number;
};

/**
 * Read mono f32le from FFmpeg at 100 Hz, merge to `samplesPerSec` max-abs peaks per second.
 */
export function extractFullSourceWaveformPeaks(
  inputPath: string,
  options?: { ffmpegBin?: string; timeoutMs?: number; samplesPerSec?: number }
): Promise<WaveformExtraction> {
  const spc = Math.max(1, Math.min(50, options?.samplesPerSec ?? 10));
  const internalSr = 100;
  const groupSize = Math.max(1, Math.round(internalSr / spc));
  const ffmpeg = options?.ffmpegBin?.trim() || "ffmpeg";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      String(internalSr),
      "-f",
      "f32le",
      "pipe:1",
    ];
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`FFmpeg waveform timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (ch: Buffer) => {
      chunks.push(ch);
    });
    child.stderr?.on("data", (ch: Buffer) => {
      stderr += ch.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
        return;
      }
      const raw = Buffer.concat(chunks);
      const f32 = new Float32Array(
        raw.buffer,
        raw.byteOffset,
        Math.floor(raw.byteLength / 4)
      );
      if (f32.length === 0) {
        resolve({ peaks: [0.01], samplesPerSec: spc });
        return;
      }
      const peaks: number[] = [];
      for (let i = 0; i < f32.length; i += groupSize) {
        let m = 0;
        for (let j = 0; j < groupSize && i + j < f32.length; j += 1) {
          const v = Math.abs(f32[i + j]!);
          if (v > m) {
            m = v;
          }
        }
        peaks.push(m);
      }
      const mx = Math.max(1e-6, ...peaks);
      const norm = peaks.map((p) => p / mx);
      resolve({ peaks: norm, samplesPerSec: spc });
    });
  });
}
