import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Dev-only: stream a file to disk under `root` without holding the full file in memory.
 * `key` is relative (e.g. raw/{projectId}/{jobId}/original.mp4).
 */
export async function putObjectToLocalDir(
  root: string,
  key: string,
  body: Readable
): Promise<void> {
  const fullPath = join(root, key);
  await mkdir(dirname(fullPath), { recursive: true });
  const out = createWriteStream(fullPath, { highWaterMark: 1024 * 1024 });
  await pipeline(body, out);
}

export async function putLocalTextFile(
  root: string,
  key: string,
  data: string
): Promise<void> {
  const fullPath = join(root, key);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data, "utf8");
}
