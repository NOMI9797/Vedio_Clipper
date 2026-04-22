import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";

import { getObjectToFile } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";

type Result = { workDir: string; mediaPath: string; cleanup: () => Promise<void> };

/**
 * Copy object from R2 or local object store to a temp file for FFmpeg.
 */
export async function downloadObjectToTempFile(objectKey: string): Promise<Result> {
  const target = resolveUploadBackend();
  if (!target.ok) {
    throw new Error(target.message);
  }
  const ext = extname(objectKey) || ".mp4";
  const workDir = await mkdtemp(join(tmpdir(), "vc-trans-"));
  const mediaPath = join(workDir, `source${ext}`);

  if (target.backend.kind === "r2") {
    const { s3, config } = target.backend;
    await getObjectToFile(s3, config.bucket, objectKey, mediaPath);
  } else {
    const src = join(target.backend.rootDir, objectKey);
    await copyFile(src, mediaPath);
  }

  const cleanup = async () => {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };
  return { workDir, mediaPath, cleanup };
}
