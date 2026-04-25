"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { ClipEntry } from "@/lib/clips/clip-entry";

type ClipsResponse =
  | { sourceDurationSec?: number; clips?: ClipEntry[] }
  | ClipEntry[];

const JOB_CLIPS_KEY = "job-clips";

export function useJobClips(jobId: string | null) {
  const query = useQuery({
    queryKey: [JOB_CLIPS_KEY, jobId],
    queryFn: async (): Promise<{ clips: ClipEntry[]; sourceDurationSec: number }> => {
      if (!jobId) {
        return { clips: [], sourceDurationSec: 0 };
      }
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`);
      const raw = await res.text();
      if (!res.ok) {
        throw new Error("Could not load clips");
      }
      const body = JSON.parse(raw) as ClipsResponse;
      if (Array.isArray(body)) {
        return { clips: body, sourceDurationSec: 0 };
      }
      return {
        clips: body.clips ?? [],
        sourceDurationSec: body.sourceDurationSec ?? 0,
      };
    },
    enabled: !!jobId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    clips: query.data?.clips ?? [],
    sourceDurationSec: query.data?.sourceDurationSec ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
