import { runClipPreviewRender } from "@/lib/clip/run-clip-preview";

const inflight = new Set<string>();

/**
 * Enqueue a single-tenant preview for this clip; skips if a run is already in progress.
 */
export function requestClipPreviewRender(jobId: string, clipId: string): void {
  const key = `${jobId}:${clipId}`;
  if (inflight.has(key)) {
    return;
  }
  inflight.add(key);
  void (async () => {
    try {
      await runClipPreviewRender({ jobId, clipId });
    } catch (e) {
      console.error("[clip-preview] failed", jobId, clipId, e);
    } finally {
      inflight.delete(key);
    }
  })();
}
