import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getObjectToFile } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";

export async function getProcessedBinary(
  jobId: string,
  relativePath: string
): Promise<Buffer> {
  const key = `processed/${jobId}/${relativePath}`;
  const target = resolveUploadBackend();
  if (!target.ok) {
    throw new Error(target.message);
  }
  if (target.backend.kind === "r2") {
    const { s3, config } = target.backend;
    const dir = await mkdtemp(join(tmpdir(), "vc-pbin-"));
    const file = join(dir, "blob.bin");
    try {
      await getObjectToFile(s3, config.bucket, key, file);
      return readFile(file);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return readFile(join(target.backend.rootDir, key));
}
