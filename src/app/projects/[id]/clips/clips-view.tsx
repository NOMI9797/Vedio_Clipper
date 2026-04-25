"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { ReadyClipCard } from "@/components/clips/ready-clip-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJobClips } from "@/hooks/use-job-clips";
import { useClipMediaUrls } from "@/hooks/use-clip-media-urls";
import type { ClipEntry } from "@/lib/clips/clip-entry";
import type { StoredTranscript } from "@/lib/transcription/transcript-types";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Pause, Play, Zap } from "lucide-react";

const MIN_CLIP_S = 10;
const MAX_CLIP_S = 90;

type Props = {
  projectId: string;
  jobId: string | null;
};

export function ClipsView({ projectId, jobId }: Props) {
  // Use React Query for clip list (cached, instant load)
  const {
    clips,
    sourceDurationSec,
    isLoading: clipsLoading,
    isError,
    error,
    refetch: refetchClips,
  } = useJobClips(jobId);

  // Use separate hook for media URLs (thumbnails/previews with progressive loading)
  const {
    thumbUrls,
    previewUrls,
    loading: mediaLoading,
  } = useClipMediaUrls(jobId, clips);
  const router = useRouter();

  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(45);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualTr, setManualTr] = useState<StoredTranscript | null>(null);
  const [clipTranscript, setClipTranscript] = useState<StoredTranscript | null>(null);
  const [clipTranscriptErr, setClipTranscriptErr] = useState<string | null>(null);
  const [clipTranscriptLoading, setClipTranscriptLoading] = useState(false);
  const [manualTrErr, setManualTrErr] = useState<string | null>(null);
  const [manualTrLoading, setManualTrLoading] = useState(false);
  const [manualPlayhead, setManualPlayhead] = useState(0);
  const [manualIsPlaying, setManualIsPlaying] = useState(false);
  const manualAudioRef = useRef<HTMLAudioElement | null>(null);
  const manualAudioUrlRef = useRef<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setClipTranscript(null);
      setClipTranscriptErr(null);
      return;
    }
    let cancelled = false;
    setClipTranscriptLoading(true);
    setClipTranscriptErr(null);
    void (async () => {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/transcript`
      );
      const raw = await res.text();
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setClipTranscriptErr("Transcript unavailable for this job.");
        setClipTranscriptLoading(false);
        return;
      }
      try {
        setClipTranscript(JSON.parse(raw) as StoredTranscript);
      } catch {
        setClipTranscriptErr("Could not parse transcript.");
      } finally {
        setClipTranscriptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Local state for optimistic UI updates (clip selection)
  const [localClips, setLocalClips] = useState<ClipEntry[]>(clips);

  // Sync local clips with fetched clips
  useEffect(() => {
    setLocalClips(clips);
  }, [clips]);

  useEffect(() => {
    if (!jobId) {
      return;
    }
    let cancelled = false;
    const ac = new AbortController();

    void (async () => {
      try {
        const res = await apiFetch("/api/jobs/status-stream", {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body || cancelled) {
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buf += decoder.decode(value, { stream: true });
          let sep = buf.indexOf("\n\n");
          while (sep >= 0) {
            const chunk = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const lines = chunk.split("\n");
            let evt = "";
            let data = "";
            for (const ln of lines) {
              if (ln.startsWith("event:")) {
                evt = ln.slice("event:".length).trim();
              } else if (ln.startsWith("data:")) {
                data += ln.slice("data:".length).trim();
              }
            }
            if (evt === "clip:preview_ready" && data) {
              try {
                const payload = JSON.parse(data) as { jobId?: string };
                if (payload.jobId === jobId) {
                  void refetchClips();
                }
              } catch {
                // ignore malformed event payload
              }
            }
            sep = buf.indexOf("\n\n");
          }
        }
      } catch {
        // stream can fail in dev reloads or transient network issues
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [jobId, refetchClips]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const selectedClip =
    clips.find((c) => c.clipId === selectedClipId) ??
    clips.find((c) => c.clipId === activeClipId) ??
    clips[0] ??
    null;

  useEffect(() => {
    if (!selectedClipId && localClips.length > 0) {
      setSelectedClipId(localClips[0]!.clipId);
    }
  }, [selectedClipId, localClips]);

  const selectedClipWords = useMemo(() => {
    if (!selectedClip || !clipTranscript?.words?.length) {
      return [];
    }
    return clipTranscript.words.filter(
      (w) => w.end > selectedClip.start - 0.02 && w.start < selectedClip.end + 0.02
    );
  }, [clipTranscript, selectedClip]);

  const selectedTranscriptLines = useMemo(() => {
    if (selectedClipWords.length === 0) {
      return [];
    }
    const lines: Array<{ start: number; text: string }> = [];
    let i = 0;
    while (i < selectedClipWords.length) {
      const chunk = selectedClipWords.slice(i, i + 8);
      lines.push({
        start: chunk[0]?.start ?? 0,
        text: chunk.map((w) => w.word).join(" "),
      });
      i += 8;
    }
    return lines;
  }, [selectedClipWords]);

  const captionWordsByClip = useMemo(() => {
    const out: Record<string, Array<{ start: number; end: number; word: string }>> = {};
    const words = clipTranscript?.words ?? [];
    for (const clip of clips) {
      out[clip.clipId] = words
        .filter((w) => w.end > clip.start && w.start < clip.end)
        .map((w) => ({
          start: Math.max(clip.start, w.start),
          end: Math.min(clip.end, w.end),
          word: w.word,
        }));
    }
    return out;
  }, [clipTranscript, clips]);

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
      void refetchClips();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setManualBusy(false);
    }
  }, [jobId, sourceDurationSec, manualWindow, refetchClips]);

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
        // Optimistic update
        setLocalClips((prev) =>
          prev.map((c) => (c.clipId === clipId ? { ...c, selected } : c))
        );
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Update failed");
      }
    },
    [jobId]
  );

  function fmtClipDuration(lenSec: number) {
    const t = Math.max(0, lenSec);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function toHookText(clip: ClipEntry): string {
    const raw = (clip.suggested_title || clip.transcript_excerpt || "").trim();
    if (!raw) {
      return "Watch this clip";
    }
    const s = raw.replace(/\s+/g, " ");
    const words = s.split(" ").slice(0, 8).join(" ");
    return words.length > 48 ? `${words.slice(0, 47)}…` : words;
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

      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-zinc-100">
                Original clips
                <span className="ml-2 text-sm font-normal text-zinc-500">({localClips.length})</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {localClips.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <Zap className="h-3 w-3" />
                {localClips.filter((c) => c.score != null && c.score * 100 >= 80).length} top clips
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {clipsLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            <p className="text-sm text-zinc-500">Loading clips...</p>
          </div>
        )}
        {isError && error && <p className="text-sm text-rose-400">{error}</p>}

        {!clipsLoading && !isError && localClips.length > 0 && sourceDurationSec > 0 && (
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

        {!clipsLoading && !isError && (
          <div className="grid grid-cols-1 gap-5 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {localClips.length === 0 ? (
              <p className="col-span-full text-sm text-zinc-500">No clips for this job yet.</p>
            ) : (
              localClips.map((c) => (
                <ReadyClipCard
                  key={c.clipId}
                  clip={c}
                  previewUrl={previewUrls[c.clipId] ?? null}
                  thumbUrl={thumbUrls[c.clipId] ?? null}
                  captionWords={captionWordsByClip[c.clipId] ?? []}
                  hookText={toHookText(c)}
                  isSelected={selectedClip?.clipId === c.clipId}
                  onSelect={() => setSelectedClipId(c.clipId)}
                  isActive={activeClipId === c.clipId}
                  onSetActive={setActiveClipId}
                  onEdit={() => {
                    setActiveClipId(null);
                    router.push(
                      `/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(c.clipId)}/edit?jobId=${encodeURIComponent(jobId ?? "")}`
                    );
                  }}
                  onDownload={() => downloadClip(c.clipId, c.suggested_title)}
                  onToggleSelect={(sel) => void setClipSelection(c.clipId, sel)}
                  fmtDuration={fmtClipDuration}
                />
              ))
            )}
          </div>
        )}

        {!clipsLoading && !isError && selectedClip && (
          <div className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-100">Clip transcript</h3>
              <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                {fmtTs(selectedClip.start)} — {fmtTs(selectedClip.end)}
              </span>
            </div>
            <div className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
              {toHookText(selectedClip)}
            </div>
            {clipTranscriptLoading && (
              <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading transcript...
              </div>
            )}
            {clipTranscriptErr && (
              <p className="mt-4 text-xs text-amber-400/90">{clipTranscriptErr}</p>
            )}
            {!clipTranscriptLoading && !clipTranscriptErr && (
              <div className="mt-4 max-h-52 space-y-1.5 overflow-auto rounded-lg bg-black/30 p-3">
                {selectedTranscriptLines.length === 0 ? (
                  <p className="text-xs text-zinc-500">No transcript lines in this range.</p>
                ) : (
                  selectedTranscriptLines.map((ln, idx) => (
                    <p key={`${ln.start}-${idx}`} className="text-[13px] leading-relaxed text-zinc-300">
                      <span className="mr-2 inline-block min-w-[3rem] font-mono text-[11px] text-emerald-400/70">
                        {fmtTs(ln.start)}
                      </span>
                      {ln.text}
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
