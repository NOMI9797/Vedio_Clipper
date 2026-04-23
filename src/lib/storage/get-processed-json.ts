import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getObjectToFile } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";

export async function getProcessedJsonString(
  jobId: string,
  filename: string
): Promise<string> {
  const key = `processed/${jobId}/${filename}`;
  const target = resolveUploadBackend();
  if (!target.ok) {
    throw new Error(target.message);
  }
  if (target.backend.kind === "r2") {
    const { s3, config } = target.backend;
    const path = await mkdtemp(join(tmpdir(), "vc-pjson-"));
    const file = join(path, "p.json");
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
