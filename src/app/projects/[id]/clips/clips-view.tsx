"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { ReadyClipCard } from "@/components/clips/ready-clip-card";
import { ClipWaveformEditor } from "@/components/clips/clip-waveform-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJobReadyClips } from "@/hooks/use-job-ready-clips";
import type { ClipEntry } from "@/lib/clips/clip-entry";
import type { StoredTranscript } from "@/lib/transcription/transcript-types";
import { cn } from "@/lib/utils";
import { Loader2, Pause, Play } from "lucide-react";

const MIN_CLIP_S = 10;
const MAX_CLIP_S = 90;

type Props = {
  projectId: string;
  jobId: string | null;
};

export function ClipsView({ projectId, jobId }: Props) {
  const {
    clips,
    setClips,
    sourceDurationSec,
    loading,
    error,
    refetch,
    thumbUrls,
    previewUrls,
  } = useJobReadyClips(jobId);

  const [editingClip, setEditingClip] = useState<ClipEntry | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(45);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualTr, setManualTr] = useState<StoredTranscript | null>(null);
  const [manualTrErr, setManualTrErr] = useState<string | null>(null);
  const [manualTrLoading, setManualTrLoading] = useState(false);
  const [manualPlayhead, setManualPlayhead] = useState(0);
  const [manualIsPlaying, setManualIsPlaying] = useState(false);
  const manualAudioRef = useRef<HTMLAudioElement | null>(null);
  const manualAudioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!editingClip) {
      return;
    }
    const n = clips.find((c) => c.clipId === editingClip.clipId);
    if (
      n &&
      (n.previewReady !== editingClip.previewReady ||
        n.start !== editingClip.start ||
        n.end !== editingClip.end ||
        n.edited !== editingClip.edited)
    ) {
      setEditingClip(n);
    }
  }, [clips, editingClip]);

  useEffect(() => {
    if (!manualAddOpen || !jobId) {
      return;
    }
    let c = false;
    setManualTrLoading(true);
    setManualTrErr(null);
    void (async () => {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/transcript`
      );
      if (c) {
        return;
      }
      if (!res.ok) {
        setManualTrErr("Could not load transcript.");
        setManualTrLoading(false);
        return;
      }
      const raw = await res.text();
      if (c) {
        return;
      }
      setManualTr(JSON.parse(raw) as StoredTranscript);
      setManualTrLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [manualAddOpen, jobId]);

  useEffect(() => {
    if (!manualAddOpen || sourceDurationSec <= 0) {
      return;
    }
    setManualStart(0);
    setManualEnd(
      Math.min(45, Math.max(MIN_CLIP_S, Math.min(MAX_CLIP_S, sourceDurationSec)))
    );
  }, [manualAddOpen, sourceDurationSec]);

  useEffect(() => {
    if (!manualAddOpen) {
      return;
    }
    setManualIsPlaying(false);
    manualAudioRef.current?.pause();
    if (manualAudioUrlRef.current) {
      URL.revokeObjectURL(manualAudioUrlRef.current);
      manualAudioUrlRef.current = null;
    }
    if (manualAudioRef.current) {
      manualAudioRef.current.src = "";
    }
  }, [manualAddOpen, manualStart, manualEnd]);

  const manualWindow = useMemo(() => {
    const a0 = Math.min(manualStart, manualEnd);
    const a1 = Math.max(manualStart, manualEnd);
    const d = a1 - a0;
    return { a0, a1, d, validLen: d >= MIN_CLIP_S - 0.01 && d <= MAX_CLIP_S + 0.01 };
  }, [manualStart, manualEnd]);

  const manualPreviewWords = useMemo(() => {
    const w = manualTr?.words;
    if (!w?.length) {
      return [];
    }
    const { a0, a1 } = manualWindow;
    return w.filter((x) => x.end > a0 - 0.02 && x.start < a1 + 0.02);
  }, [manualTr, manualWindow]);

  useEffect(() => {
    if (!manualAddOpen || !manualIsPlaying) {
      return;
    }
    const a = manualAudioRef.current;
    if (!a) {
      return;
    }
    const t0 = manualWindow.a0;
    const onT = () => {
      setManualPlayhead(t0 + a.currentTime);
    };
    a.addEventListener("timeupdate", onT);
    return () => a.removeEventListener("timeupdate", onT);
  }, [manualAddOpen, manualIsPlaying, manualWindow.a0]);

  const playManualPreview = useCallback(async () => {
    if (!jobId) {
      return;
    }
    const anchor = clips[0]?.clipId;
    if (!anchor) {
      setToast("Clips are still loading.");
      return;
    }
    const { a0, a1, validLen } = manualWindow;
    if (a0 < 0 || a1 > sourceDurationSec) {
      setToast("Range must be within the source video.");
      return;
    }
    if (!validLen) {
      setToast(`Length must be ${MIN_CLIP_S}–${MAX_CLIP_S}s.`);
      return;
    }
    if (manualIsPlaying) {
      manualAudioRef.current?.pause();
      setManualIsPlaying(false);
      return;
    }
    if (manualAudioUrlRef.current) {
      URL.revokeObjectURL(manualAudioUrlRef.current);
      manualAudioUrlRef.current = null;
    }
    try {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(
          anchor
        )}/audio?from=${a0}&to=${a1}`
      );
      if (!res.ok) {
        setToast("Could not load audio for this range.");
        return;
      }
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
      manualAudioUrlRef.current = url;
      const el = manualAudioRef.current;
      if (!el) {
        return;
      }
      el.src = url;
      setManualPlayhead(a0);
      void el
        .play()
        .then(() => setManualIsPlaying(true))
        .catch(() => setManualIsPlaying(false));
    } catch {
      setToast("Audio preview failed.");
    }
  }, [clips, jobId, manualIsPlaying, manualWindow, sourceDurationSec]);

  const addManualClip = useCallback(async () => {
    if (!jobId) {
      return;
    }
    const { a0, a1, validLen } = manualWindow;
    if (a0 < 0 || a1 > sourceDurationSec) {
      setToast("Out of range.");
      return;
    }
    if (!validLen) {
      setToast(`Length must be ${MIN_CLIP_S}–${MAX_CLIP_S}s.`);
      return;
    }
    setManualBusy(true);
    try {
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: true, start: a0, end: a1 }),
      });
      const raw = await res.text();
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
        setToast(msg);
        return;
      }
      setToast("Clip added. Encoding preview…");
      setManualAddOpen(false);
      void refetch();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setManualBusy(false);
    }
  }, [jobId, sourceDurationSec, manualWindow, refetch]);

  const downloadClip = useCallback(
    (clipId: string, title: string) => {
      const u = previewUrls[clipId];
      if (!u) {
        setToast("Preview not ready yet.");
        return;
      }
      const a = document.createElement("a");
      a.href = u;
      a.download = `${(title.replace(/[^\w\s-]+/g, "") || "clip").trim().slice(0, 80)}-preview.mp4`;
      a.click();
    },
    [previewUrls]
  );

  const setClipSelection = useCallback(
    async (clipId: string, selected: boolean) => {
      if (!jobId) {
        return;
      }
      try {
        const res = await apiFetch(
          `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clipId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selected }),
          }
        );
        const raw = await res.text();
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
          setToast(msg);
          return;
        }
        setClips((prev) =>
          prev.map((c) => (c.clipId === clipId ? { ...c, selected } : c))
        );
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Update failed");
      }
    },
    [jobId, setClips]
  );

  function fmtClipDuration(lenSec: number) {
    const t = Math.max(0, lenSec);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function fmtTs(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  if (!jobId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center">
        <h1 className="text-lg font-semibold text-zinc-200">No job selected</h1>
        <p className="text-sm text-zinc-500">
          Open this page with <code className="rounded bg-zinc-900 px-1.5">?jobId=…</code> from
          your project after analysis finishes.
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/projects/${projectId}`}>Back to project</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-black text-zinc-200">
      {toast && (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-emerald-500/30 bg-zinc-900/95 px-4 py-2 text-sm text-emerald-200">
          {toast}
        </div>
      )}

      <div className="border-b border-zinc-800/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Link
                href={`/projects/${projectId}`}
                className="hover:text-cyan-400/90"
              >
                ← Project
              </Link>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
              Original clips ({clips.length})
            </h1>
            <p className="text-xs text-zinc-500">
              Hover a card to show play — click the button for video and audio. Only one plays at
              a time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-zinc-400"
              disabled
              title="Coming later"
            >
              Select
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-zinc-400"
              disabled
            >
              Filter
            </Button>
            <code className="max-w-[10rem] truncate rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] text-zinc-500">
              {jobId}
            </code>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading clips…
          </p>
        )}
        {error && <p className="text-sm text-rose-400">{error}</p>}

        {!loading && !error && clips.length > 0 && sourceDurationSec > 0 && (
          <div className="mb-8 rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-cyan-200/80">Add a manual clip (start / end in seconds)</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setManualAddOpen((v) => !v)}
              >
                {manualAddOpen ? "Hide" : "Set in / out"}
              </Button>
            </div>
            {manualAddOpen && (
              <div className="mt-4 space-y-3">
                {manualTrLoading && (
                  <p className="text-xs text-zinc-500">
                    <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    Transcript…
                  </p>
                )}
                {manualTrErr && <p className="text-xs text-amber-400/90">{manualTrErr}</p>}
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <p className="text-[10px] text-zinc-500">Start (s)</p>
                    <Input
                      type="number"
                      className="h-8 w-24"
                      step={0.1}
                      value={Number.isNaN(manualStart) ? 0 : manualStart}
                      onChange={(e) => setManualStart(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500">End (s)</p>
                    <Input
                      type="number"
                      className="h-8 w-24"
                      step={0.1}
                      value={Number.isNaN(manualEnd) ? 0 : manualEnd}
                      onChange={(e) => setManualEnd(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => void playManualPreview()}
                    aria-label={manualIsPlaying ? "Pause" : "Play range"}
                  >
                    {manualIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Source {sourceDurationSec.toFixed(1)}s · length {manualWindow.d.toFixed(1)}s
                </p>
                <div className="max-h-24 overflow-auto rounded border border-zinc-800/80 p-2 text-[11px] text-zinc-500">
                  {manualPreviewWords.length === 0
                    ? "No words in this range"
                    : manualPreviewWords.map((w, i) => {
                        const on =
                          manualIsPlaying &&
                          manualPlayhead >= w.start &&
                          manualPlayhead < w.end;
                        return (
                          <span
                            key={i}
                            className={cn("mr-1", on && "text-cyan-200")}
                          >
                            {w.word}
                          </span>
                        );
                      })}
                </div>
                <audio
                  ref={manualAudioRef}
                  className="hidden"
                  onEnded={() => setManualIsPlaying(false)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={manualBusy || !manualWindow.validLen}
                  onClick={() => void addManualClip()}
                >
                  {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save manual clip"}
                </Button>
              </div>
            )}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-4">
            {clips.length === 0 ? (
              <p className="col-span-full text-sm text-zinc-500">No clips for this job yet.</p>
            ) : (
              clips.map((c) => (
                <ReadyClipCard
                  key={c.clipId}
                  clip={c}
                  previewUrl={previewUrls[c.clipId] ?? null}
                  thumbUrl={thumbUrls[c.clipId] ?? null}
                  isActive={activeClipId === c.clipId}
                  onSetActive={setActiveClipId}
                  onEdit={() => {
                    setActiveClipId(null);
                    setEditingClip(c);
                  }}
                  onDownload={() => downloadClip(c.clipId, c.suggested_title)}
                  onToggleSelect={(sel) => void setClipSelection(c.clipId, sel)}
                  fmtDuration={fmtClipDuration}
                />
              ))
            )}
          </div>
        )}
      </div>

      {editingClip && jobId ? (
        <ClipWaveformEditor
          key={editingClip.clipId}
          open
          onOpenChange={(o) => {
            if (!o) {
              setEditingClip(null);
            }
          }}
          jobId={jobId}
          clip={editingClip}
          sourceDurationSec={sourceDurationSec}
          onPatched={(next) => {
            setClips((prev) =>
              prev.map((x) => (x.clipId === next.clipId ? { ...x, ...next } : x))
            );
            setEditingClip((cur) =>
              cur && cur.clipId === next.clipId ? { ...cur, ...next } : cur
            );
          }}
          onClipsRefresh={refetch}
          fmtTs={fmtTs}
        />
      ) : null}
    </div>
  );
}
