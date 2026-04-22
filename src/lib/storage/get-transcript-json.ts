import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getObjectToFile } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";

export const transcriptObjectKey = (jobId: string) =>
  `processed/${jobId}/transcript.json`;

/**
 * Read transcript JSON from R2 or local object store.
 */
export async function getTranscriptJsonString(jobId: string): Promise<string> {
  const key = transcriptObjectKey(jobId);
  const target = resolveUploadBackend();
  if (!target.ok) {
    throw new Error(target.message);
  }
  if (target.backend.kind === "r2") {
    const { s3, config } = target.backend;
    const path = await mkdtemp(join(tmpdir(), "vc-tjson-"));
    const file = join(path, "t.json");
    try {
      await getObjectToFile(s3, config.bucket, key, file);
      return readFile(file, "utf-8");
    } finally {
      try {
        await rm(path, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
  return readFile(join(target.backend.rootDir, key), "utf-8");
}
