"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import type { ClipEntry } from "@/lib/clips/clip-entry";

type ClipsResponse =
  | { sourceDurationSec?: number; clips?: ClipEntry[] }
  | ClipEntry[];

/**
 * Loads clip list, thumbnails, and preview MP4 blob URLs for a job.
 * Revokes object URLs on job change and unmount.
 */
export function useJobReadyClips(jobId: string | null) {
  const [clips, setClips] = useState<ClipEntry[]>([]);
  const [sourceDurationSec, setSourceDurationSec] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const clipsRef = useRef<ClipEntry[]>([]);
  clipsRef.current = clips;
  const refetchInFlightRef = useRef(false);
  const lastRefetchMsRef = useRef(0);
  const thumbRef = useRef<Record<string, string>>({});
  const previewRef = useRef<Record<string, string>>({});
  thumbRef.current = thumbUrls;
  previewRef.current = previewUrls;

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

  const refetch = useCallback(async () => {
    if (!jobId) {
      return;
    }
    const now = Date.now();
    // Guard against rapid repeated triggers from multiple timers/components.
    if (refetchInFlightRef.current) {
      return;
    }
    if (now - lastRefetchMsRef.current < 4000) {
      return;
    }
    refetchInFlightRef.current = true;
    lastRefetchMsRef.current = now;
    try {
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`);
      const raw = await res.text();
      if (!res.ok) {
        return;
      }
      const j = JSON.parse(raw) as ClipsResponse;
      if (Array.isArray(j)) {
        setClips(j);
      } else {
        setSourceDurationSec(j.sourceDurationSec ?? 0);
        setClips(j.clips ?? []);
      }
    } finally {
      refetchInFlightRef.current = false;
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setClips([]);
      setSourceDurationSec(0);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`);
      const raw = await res.text();
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        let msg = raw;
        try {
          const j = JSON.parse(raw) as { error?: string };
          if (j.error) {
            msg = j.error;
          }
        } catch {
          // keep
        }
        setError(msg);
        setClips([]);
        setLoading(false);
        return;
      }
      const body = JSON.parse(raw) as
        | ClipEntry[]
        | { sourceDurationSec?: number; clips?: ClipEntry[] };
      if (Array.isArray(body)) {
        setSourceDurationSec(0);
        setClips(body);
      } else {
        setSourceDurationSec(body.sourceDurationSec ?? 0);
        setClips(body.clips ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId || clips.length === 0) {
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    const run = async () => {
      const entries: Array<[string, string]> = [];
      await Promise.all(
        clips.map(async (clip) => {
          try {
            const res = await apiFetch(
              `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(
                clip.clipId
              )}/thumbnail`
            );
            if (!res.ok) {
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
      if (cancelled) {
        for (const u of created) {
          URL.revokeObjectURL(u);
        }
        return;
      }
      setThumbUrls((prev) => {
        for (const old of Object.values(prev)) {
          URL.revokeObjectURL(old);
        }
        return Object.fromEntries(entries);
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobId, clips]);

  const clipPreviewFetchKey = useMemo(
    () =>
      clips
        .map((c) => `${c.clipId}:${c.start.toFixed(2)}:${c.end.toFixed(2)}`)
        .join("|"),
    [clips]
  );

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
      const entries: Array<[string, string]> = [];
      await Promise.all(
        list.map(async (clip) => {
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
              t
                ? blob
                : new Blob([blob], { type: "video/mp4" })
            );
            created.push(url);
            entries.push([clip.clipId, url]);
          } catch {
            // per-clip
          }
        })
      );
      if (cancelled) {
        for (const u of created) {
          URL.revokeObjectURL(u);
        }
        return;
      }
      setPreviewUrls((prev) => {
        for (const u of Object.values(prev)) {
          URL.revokeObjectURL(u);
        }
        return Object.fromEntries(entries);
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobId, clipPreviewFetchKey]);

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

  return {
    clips,
    setClips,
    sourceDurationSec,
    loading,
    error,
    refetch,
    thumbUrls,
    previewUrls,
  };
}
