/**
 * Local CLI: npx tsx src/jobs/run-transcribe-once.ts [maxJobs]
 * Loads .env.local via dotenv (same as drizzle).
 */
import { resolve } from "node:path";

import { config } from "dotenv";

import { runTranscriptionBatch } from "../lib/worker/run-transcription-pipeline";

config({ path: resolve(process.cwd(), ".env.local") });
config();

const maxArg = process.argv[2] ?? "5";
const n = Math.min(20, Math.max(1, Number.parseInt(maxArg, 10) || 5));

void (async () => {
  const r = await runTranscriptionBatch(n);
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length > 0) {
    process.exit(1);
  }
})();
