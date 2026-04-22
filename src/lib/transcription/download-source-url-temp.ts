import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

type Result = { workDir: string; mediaPath: string; cleanup: () => Promise<void> };

const YTDLP_BIN = process.env.YTDLP_PATH?.trim() || "yt-dlp";

export async function downloadSourceUrlToTempFile(sourceUrl: string): Promise<Result> {
  const workDir = await mkdtemp(join(tmpdir(), "vc-link-"));
  const outputTemplate = join(workDir, "source.%(ext)s");
  const mediaPath = await runYtDlp(sourceUrl, outputTemplate);

  const cleanup = async () => {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return { workDir, mediaPath, cleanup };
}

async function runYtDlp(sourceUrl: string, outputTemplate: string): Promise<string> {
  const args = [
    "--no-playlist",
    "--no-progress",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
    sourceUrl,
  ];

  return await new Promise<string>((resolve, reject) => {
    const cp = spawn(YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    cp.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    cp.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    cp.on("error", (error) => {
      reject(
        new Error(
          `Failed to start yt-dlp (${YTDLP_BIN}). Install it or set YTDLP_PATH. ${error.message}`
        )
      );
    });

    cp.on("close", (code) => {
      if (code !== 0) {
        const msg = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`yt-dlp failed: ${msg}`));
        return;
      }
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const last = lines.at(-1);
      if (!last) {
        reject(new Error("yt-dlp succeeded but returned no output file path"));
        return;
      }
      resolve(last);
    });
  });
}
