import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { putObjectBuffer } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";

export async function putProcessedBinary(
  jobId: string,
  relativePath: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const key = `processed/${jobId}/${relativePath}`;
  const target = resolveUploadBackend();
  if (!target.ok) {
    throw new Error(target.message);
  }
  if (target.backend.kind === "r2") {
    const { s3, config } = target.backend;
    await putObjectBuffer(s3, config.bucket, key, body, contentType);
  } else {
    const full = join(target.backend.rootDir, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  return key;
}
