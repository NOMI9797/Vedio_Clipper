"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { ClipWaveformEditor } from "@/components/clips/clip-waveform-editor";
import { useJobReadyClips } from "@/hooks/use-job-ready-clips";

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
  const { clips, setClips, sourceDurationSec, loading, error, refetch } = useJobReadyClips(jobId);

  const clip = useMemo(
    () => clips.find((c) => c.clipId === clipId) as Clip | undefined,
    [clips, clipId]
  );

  const backHref = `/projects/${projectId}/clips${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`;

  useEffect(() => {
    if (!jobId) {
      return;
    }
    if (clip) {
      return;
    }
    void refetch();
  }, [jobId, clip, refetch]);

  if (!jobId) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6 text-zinc-300">
        <p className="text-sm">Missing <code>jobId</code> query param.</p>
        <Link href={backHref} className="text-cyan-400 hover:text-cyan-300">Back to clips</Link>
      </div>
    );
  }

  if (loading && !clip) {
    return <div className="p-6 text-sm text-zinc-400">Loading clip editor…</div>;
  }

  if (error && !clip) {
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
        onPatched={(next) => {
          setClips((prev) => prev.map((x) => (x.clipId === next.clipId ? { ...x, ...next } : x)));
        }}
        onClipsRefresh={refetch}
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
