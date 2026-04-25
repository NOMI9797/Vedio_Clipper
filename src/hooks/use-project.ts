"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiFetch } from "@/lib/api/client";

type ProjectView = {
  id: string;
  name: string;
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
};

type JobRow = {
  id: string;
  jobType: string;
  status: string;
  progress: number;
  objectKey: string | null;
  sourceUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectResponse = {
  project?: ProjectView;
  jobs?: JobRow[];
  error?: string;
};

const PROJECT_QUERY_KEY = "project";

function isProcessing(status: string): boolean {
  return (
    status === "queued" ||
    status === "processing" ||
    status === "transcript_complete" ||
    status === "analysis_complete"
  );
}

export function useProject(projectId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PROJECT_QUERY_KEY, projectId],
    queryFn: async (): Promise<ProjectResponse> => {
      if (!projectId) {
        return { project: undefined, jobs: [] };
      }
      const res = await apiFetch(`/api/projects/${projectId}`);
      const body = (await res.json().catch(() => ({}))) as ProjectResponse;
      if (!res.ok) {
        throw new Error(body.error ?? "Could not load project");
      }
      return body;
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.jobs) return false;
      // Poll every 3 seconds while any job is processing
      const hasProcessing = data.jobs.some((j) => isProcessing(j.status));
      return hasProcessing ? 3000 : false;
    },
  });

  const prefetchJobClips = useCallback(
    (jobId: string) => {
      // Pre-fetch clips data into cache so clips page loads instantly
      queryClient.prefetchQuery({
        queryKey: ["job-clips", jobId],
        queryFn: async () => {
          const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`);
          if (!res.ok) return null;
          const raw = await res.text();
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
      });
    },
    [queryClient]
  );

  return {
    project: query.data?.project ?? null,
    jobs: query.data?.jobs ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    prefetchJobClips,
  };
}
