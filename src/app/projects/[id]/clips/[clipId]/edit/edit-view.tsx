"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ClipWaveformEditor } from "@/components/clips/clip-waveform-editor";
import { useClipMediaUrls } from "@/hooks/use-clip-media-urls";
import { useJobClips } from "@/hooks/use-job-clips";
import type { ClipEntry } from "@/lib/clips/clip-entry";

type Clip = {
  clipId: string;
  start: number;
  end: number;
  transcript_excerpt: string;
  suggested_title: string;
  edited?: boolean;
  selected?: boolean;
  previewReady?: boolean;
};

type Props = {
  projectId: string;
  clipId: string;
  jobId: string | null;
};

export function EditClipView({ projectId, clipId, jobId }: Props) {
  const router = useRouter();

  // Use React Query cached data for instant load
  const {
    clips,
    sourceDurationSec,
    isLoading,
    isError,
    error,
    refetch,
  } = useJobClips(jobId);

  // Local state for optimistic updates
  const [localClips, setLocalClips] = useState<ClipEntry[]>(clips);

  // Sync with fetched clips
  useEffect(() => {
    setLocalClips(clips);
  }, [clips]);

  // Media URLs for the editor
  const { thumbUrls, previewUrls } = useClipMediaUrls(jobId, localClips);

  const clip = useMemo(
    () => localClips.find((c) => c.clipId === clipId) as Clip | undefined,
    [localClips, clipId]
  );

  const backHref = `/projects/${projectId}/clips${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`;

  // Refetch if clip not found (might be new)
  useEffect(() => {
    if (!jobId) return;
    if (clip) return;
    // Only refetch once if clip is missing
    const t = setTimeout(() => void refetch(), 500);
    return () => clearTimeout(t);
  }, [jobId, clip, refetch]);

  if (!jobId) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6 text-zinc-300">
        <p className="text-sm">Missing <code>jobId</code> query param.</p>
        <Link href={backHref} className="text-cyan-400 hover:text-cyan-300">Back to clips</Link>
      </div>
    );
  }

  if (isLoading && !clip) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
          <p className="text-sm text-zinc-500">Loading clip...</p>
        </div>
      </div>
    );
  }

  if (isError && !clip) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6 text-zinc-300">
        <p className="text-sm text-rose-400">{error}</p>
        <Link href={backHref} className="text-cyan-400 hover:text-cyan-300">Back to clips</Link>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6 text-zinc-300">
        <p className="text-sm">Clip not found for this job.</p>
        <Link href={backHref} className="text-cyan-400 hover:text-cyan-300">Back to clips</Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-black text-zinc-200">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <Link href={backHref} className="text-sm text-zinc-400 hover:text-cyan-400">← Back to clips</Link>
      </div>
      <ClipWaveformEditor
        standalone
        open
        onOpenChange={(o) => {
          if (!o) {
            router.push(backHref);
          }
        }}
        jobId={jobId}
        clip={clip}
        sourceDurationSec={sourceDurationSec}
        thumbUrl={thumbUrls[clipId] ?? null}
        previewUrl={previewUrls[clipId] ?? null}
        onPatched={(next) => {
          // Optimistic update
          setLocalClips((prev) =>
            prev.map((x) => (x.clipId === next.clipId ? { ...x, ...next } : x))
          );
        }}
        onClipsRefresh={() => void refetch()}
        fmtTs={(s) => {
          const total = Math.max(0, Math.floor(s));
          const m = Math.floor(total / 60).toString().padStart(2, "0");
          const ss = (total % 60).toString().padStart(2, "0");
          return `${m}:${ss}`;
        }}
      />
    </div>
  );
}
