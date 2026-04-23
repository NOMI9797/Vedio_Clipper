import { putLocalTextFile } from "@/lib/storage/local-disc";
import { putObjectJson } from "@/lib/storage/r2";
import { resolveUploadBackend } from "@/lib/storage/resolve-upload-backend";

export async function putProcessedJson(
  jobId: string,
  relativePath: string,
  jsonBody: string
): Promise<string> {
  const key = `processed/${jobId}/${relativePath}`;
  const target = resolveUploadBackend();
  if (!target.ok) {
    throw new Error(target.message);
  }
  if (target.backend.kind === "r2") {
    const { s3, config } = target.backend;
    await putObjectJson(s3, config.bucket, key, jsonBody);
  } else {
    await putLocalTextFile(target.backend.rootDir, key, jsonBody);
  }
  return key;
}
