import path from "node:path";

import { createR2S3Client, getR2ConfigFromEnv, type R2Env } from "@/lib/storage/r2";
import type { S3Client } from "@aws-sdk/client-s3";

export type UploadBackend =
  | { kind: "r2"; config: R2Env; s3: S3Client }
  | { kind: "local"; rootDir: string };

const STORAGE_ERROR =
  "Object storage is not configured. For production, set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in .env.local. For local development without R2, set OBJECT_STORE_LOCAL=1 and restart the dev server (files are saved under .local-object-store).";

/**
 * Prefers R2 when all variables are set; otherwise in development allows disk storage.
 */
export function resolveUploadBackend():
  | { ok: true; backend: UploadBackend }
  | { ok: false; message: string } {
  const r2 = getR2ConfigFromEnv();
  if (r2) {
    return { ok: true, backend: { kind: "r2", config: r2, s3: createR2S3Client(r2) } };
  }
  if (
    process.env.NODE_ENV === "development" &&
    process.env.OBJECT_STORE_LOCAL === "1"
  ) {
    const sub =
      process.env.OBJECT_STORE_LOCAL_DIR?.trim() || ".local-object-store";
    const rootDir = path.isAbsolute(sub)
      ? sub
      : path.join(process.cwd(), sub);
    return { ok: true, backend: { kind: "local", rootDir } };
  }
  return { ok: false, message: STORAGE_ERROR };
}
