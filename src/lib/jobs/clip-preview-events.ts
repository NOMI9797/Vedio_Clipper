import { EventEmitter } from "node:events";

export type ClipPreviewReady = {
  event: "clip:preview_ready";
  jobId: string;
  clipId: string;
  projectId: string;
  userId: string;
  /** true when file written; false on failure. */
  ok: boolean;
};

const gKey = "__vc_clip_preview_emitter__";

function emitter(): EventEmitter {
  const g = globalThis as typeof globalThis & { [gKey]?: EventEmitter };
  if (!g[gKey]) {
    g[gKey] = new EventEmitter();
    g[gKey]!.setMaxListeners(200);
  }
  return g[gKey]!;
}

export function publishClipPreviewEvent(update: ClipPreviewReady): void {
  emitter().emit("clip:preview", update);
}

export function onClipPreviewEvent(handler: (update: ClipPreviewReady) => void): () => void {
  const e = emitter();
  e.on("clip:preview", handler);
  return () => e.off("clip:preview", handler);
}
