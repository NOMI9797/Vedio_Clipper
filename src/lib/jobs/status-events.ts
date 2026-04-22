import { EventEmitter } from "node:events";

type JobStatusUpdate = {
  event: "job:status_update";
  jobId: string;
  projectId: string;
  userId: string;
  status: string;
  progress: number;
  updatedAt: string;
  error?: string | null;
};

const globalKey = "__vc_job_status_emitter__";

function getEmitter(): EventEmitter {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: EventEmitter;
  };
  if (!g[globalKey]) {
    g[globalKey] = new EventEmitter();
    g[globalKey].setMaxListeners(100);
  }
  return g[globalKey];
}

export function publishJobStatusUpdate(update: JobStatusUpdate): void {
  getEmitter().emit("job:status_update", update);
}

export function onJobStatusUpdate(handler: (update: JobStatusUpdate) => void): () => void {
  const emitter = getEmitter();
  emitter.on("job:status_update", handler);
  return () => emitter.off("job:status_update", handler);
}

export type { JobStatusUpdate };
