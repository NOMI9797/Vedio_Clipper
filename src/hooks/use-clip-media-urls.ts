"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import type { ClipEntry } from "@/lib/clips/clip-entry";

const THUMB_BATCH = 4;
const PREVIEW_BATCH = 2;
const BATCH_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Loads thumbnail and preview MP4 blob URLs progressively for clips.
 * Works with React Query cached clip data.
 */
export function useClipMediaUrls(jobId: string | null, clips: ClipEntry[]) {
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const clipsRef = useRef<ClipEntry[]>([]);
  clipsRef.current = clips;
  const thumbRef = useRef<Record<string, string>>({});
  const previewRef = useRef<Record<string, string>>({});
  thumbRef.current = thumbUrls;
  previewRef.current = previewUrls;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const u of Object.values(thumbRef.current)) {
        URL.revokeObjectURL(u);
      }
      for (const u of Object.values(previewRef.current)) {
        URL.revokeObjectURL(u);
      }
    };
  }, []);

  // Cleanup on job change
  useEffect(() => {
    if (!jobId) {
      setThumbUrls((prev) => {
        for (const u of Object.values(prev)) {
          URL.revokeObjectURL(u);
        }
        return {};
      });
      setPreviewUrls((prev) => {
        for (const u of Object.values(prev)) {
          URL.revokeObjectURL(u);
        }
        return {};
      });
    }
  }, [jobId]);

  // Fetch thumbnails in small batches
  useEffect(() => {
    if (!jobId || clips.length === 0) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    const created: string[] = [];

    const run = async () => {
      const entries: Array<[string, string]> = [];
      for (let i = 0; i < clips.length; i += THUMB_BATCH) {
        if (cancelled) break;
        const batch = clips.slice(i, i + THUMB_BATCH);
        await Promise.all(
          batch.map(async (clip) => {
            try {
              const res = await apiFetch(
                `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(
                  clip.clipId
                )}/thumbnail`
              );
              if (!res.ok || cancelled) {
                return;
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              created.push(url);
              entries.push([clip.clipId, url]);
            } catch {
              // per-clip
            }
          })
        );
        if (!cancelled && entries.length > 0) {
          const snapshot = [...entries];
          setThumbUrls((prev) => ({ ...prev, ...Object.fromEntries(snapshot) }));
        }
        if (i + THUMB_BATCH < clips.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      for (const u of created) {
        URL.revokeObjectURL(u);
      }
    };
  }, [jobId, clips]);

  const clipPreviewFetchKey = useMemo(
    () =>
      clips
        .map((c) => `${c.clipId}:${c.start.toFixed(2)}:${c.end.toFixed(2)}`)
        .join("|"),
    [clips]
  );

  // Fetch previews in small batches
  useEffect(() => {
    if (!jobId) {
      return;
    }
    if (clipPreviewFetchKey === "") {
      setPreviewUrls((prev) => {
        for (const u of Object.values(prev)) {
          URL.revokeObjectURL(u);
        }
        return {};
      });
      return;
    }
    let cancelled = false;
    const created: string[] = [];

    const run = async () => {
      const list = clipsRef.current;
      if (list.length === 0) {
        return;
      }
      for (let i = 0; i < list.length; i += PREVIEW_BATCH) {
        if (cancelled) break;
        const batch = list.slice(i, i + PREVIEW_BATCH);
        const entries: Array<[string, string]> = [];
        await Promise.all(
          batch.map(async (clip) => {
            try {
              const res = await apiFetch(
                `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(
                  clip.clipId
                )}/preview`
              );
              if (cancelled || !res.ok) {
                return;
              }
              const blob = await res.blob();
              if (cancelled || blob.size < 32) {
                return;
              }
              const t = blob.type;
              if (
                t &&
                !t.startsWith("video/") &&
                t !== "application/octet-stream"
              ) {
                return;
              }
              const url = URL.createObjectURL(
                t ? blob : new Blob([blob], { type: "video/mp4" })
              );
              created.push(url);
              entries.push([clip.clipId, url]);
            } catch {
              // per-clip
            }
          })
        );
        if (!cancelled && entries.length > 0) {
          setPreviewUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
        if (i + PREVIEW_BATCH < list.length) {
          await sleep(BATCH_DELAY_MS * 2);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      for (const u of created) {
        URL.revokeObjectURL(u);
      }
    };
  }, [jobId, clipPreviewFetchKey]);

  return {
    thumbUrls,
    previewUrls,
    loading,
  };
}
