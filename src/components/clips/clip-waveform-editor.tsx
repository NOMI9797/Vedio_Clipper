"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { peaksForTimeWindow } from "@/lib/waveform-slice";
import type { StoredTranscript, TranscriptWord } from "@/lib/transcription/transcript-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Loader2, Pause, Play } from "lucide-react";

const MIN_S = 10;
const MAX_S = 90;
const WAVE_BINS = 200;
const FALLBACK_AUDIO_CAP = 120;

type Clip = {
  clipId: string;
  start: number;
  end: number;
  transcript_excerpt: string;
  suggested_title: string;
  edited?: boolean;
  selected?: boolean;
  /** True when `preview.mp4` is available for this clip. */
  previewReady?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
  jobId: string;
  clip: Clip;
  sourceDurationSec: number;
  onPatched: (clip: Clip) => void;
  /** When preview is not ready, poll GET /clips to update `clip.previewReady`. */
  onClipsRefresh?: () => void | Promise<void>;
  fmtTs: (s: number) => string;
};

function pickWindow(
  inT: number,
  outT: number,
  source: number
): { wFrom: number; wTo: number } {
  const a0 = Math.min(inT, outT);
  const b0 = Math.max(inT, outT);
  const pad = 5;
  let a = Math.max(0, a0 - pad);
  let b = Math.min(source, b0 + pad);
  if (b - a > 120) {
    const mid = (a + b) / 2;
    a = Math.max(0, mid - 60);
    b = Math.min(source, a + 120);
    if (b < a + 120) {
      a = Math.max(0, b - 120);
    }
  }
  a = Math.min(a, a0);
  b = Math.max(b, b0);
  a = Math.max(0, a);
  b = Math.min(source, b);
  if (b <= a) {
    b = Math.min(source, a + 1);
  }
  return { wFrom: a, wTo: b };
}

function dragIn(t: number, outFixed: number, source: number): number {
  const lo = Math.max(0, outFixed - MAX_S);
  const hi = outFixed - MIN_S;
  return Math.max(lo, Math.min(hi, t, source - MIN_S, outFixed - 1e-3));
}

function dragOut(inn: number, t: number, source: number): number {
  const lo = inn + MIN_S;
  const hi = Math.min(source, inn + MAX_S);
  return Math.max(lo, Math.min(hi, t));
}

async function decodeWavToPeaks(buf: ArrayBuffer, targetBins: number): Promise<number[]> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new Ctx();
  const decoded = await actx.decodeAudioData(buf.slice(0));
  const ch0 = decoded.getChannelData(0);
  const step = Math.max(1, Math.floor(ch0.length / targetBins));
  const p: number[] = [];
  for (let i = 0; i < targetBins; i += 1) {
    let m = 0;
    for (let j = 0; j < step; j += 1) {
      const v = Math.abs(ch0[i * step + j] ?? 0);
      if (v > m) {
        m = v;
      }
    }
    p.push(m);
  }
  const mx = Math.max(1e-6, ...p);
  await actx.close().catch(() => undefined);
  return p.map((x) => x / mx);
}

function mergePatchClip(raw: unknown): Clip {
  const c = raw as {
    clipId: string;
    start: number;
    end: number;
    transcript_excerpt: string;
    suggested_title: string;
    edited?: boolean;
    selected?: boolean;
    manual?: boolean;
    score?: number | null;
    preview_ready?: boolean;
  };
  const { preview_ready: _pr, ...rest } = c;
  return {
    ...rest,
    previewReady: c.preview_ready === true,
  };
}

export function ClipWaveformEditor({
  open,
  onOpenChange,
  standalone = false,
  jobId,
  clip,
  sourceDurationSec,
  onPatched,
  onClipsRefresh,
  fmtTs,
}: Props) {
  const [inT, setInT] = useState(clip.start);
  const [outT, setOutT] = useState(clip.end);
  const inRef = useRef(inT);
  const outRef = useRef(outT);
  const committedRef = useRef({ start: clip.start, end: clip.end });
  const [playhead, setPlayhead] = useState((clip.start + clip.end) / 2);
  const [wFrom, setWFrom] = useState(0);
  const [wTo, setWTo] = useState(1);
  const [sourcePeaks, setSourcePeaks] = useState<number[]>([]);
  const [peaksDurationSec, setPeaksDurationSec] = useState(0);
  const [waveMeta, setWaveMeta] = useState("");
  const [peaksLoading, setPeaksLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<StoredTranscript | null>(null);
  const [transcriptErr, setTranscriptErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeDrag, setActiveDrag] = useState<"in" | "out" | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playheadRef = useRef(0);
  const wFromRef = useRef(0);
  const wToRef = useRef(1);

  useLayoutEffect(() => {
    inRef.current = inT;
    outRef.current = outT;
  }, [inT, outT]);
  useLayoutEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);
  useLayoutEffect(() => {
    wFromRef.current = wFrom;
    wToRef.current = wTo;
  }, [wFrom, wTo]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setInT(clip.start);
    setOutT(clip.end);
    setPlayhead((clip.start + clip.end) / 2);
    inRef.current = clip.start;
    outRef.current = clip.end;
    committedRef.current = { start: clip.start, end: clip.end };
    setErr(null);
  }, [open, clip.clipId, clip.start, clip.end]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setTranscriptErr(null);
    void (async () => {
      try {
        const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/transcript`);
        const text = await res.text();
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setTranscriptErr("Could not load transcript for sync.");
          return;
        }
        setTranscript(JSON.parse(text) as StoredTranscript);
      } catch (e) {
        if (!cancelled) {
          setTranscriptErr(e instanceof Error ? e.message : "Transcript error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (clip.previewReady) {
      return;
    }
    if (!onClipsRefresh) {
      return;
    }
    const t = window.setInterval(() => {
      void onClipsRefresh();
    }, 4000);
    return () => window.clearInterval(t);
  }, [open, clip.clipId, clip.previewReady, onClipsRefresh]);

  useEffect(() => {
    if (!open) {
      setPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        void videoRef.current.load();
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clip.clipId)}/preview`
      );
      if (cancelled || !res.ok) {
        return;
      }
      const buf = await res.arrayBuffer();
      if (cancelled) {
        return;
      }
      setPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(new Blob([buf], { type: "video/mp4" }));
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId, clip.clipId]);

  useEffect(() => {
    if (!open) {
      setThumbUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clip.clipId)}/thumbnail`
      );
      if (cancelled || !res.ok) {
        return;
      }
      const blob = await res.blob();
      if (cancelled) {
        return;
      }
      setThumbUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(blob);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId, clip.clipId]);

  useEffect(() => {
    if (!open || sourceDurationSec <= 0) {
      return;
    }
    const w = pickWindow(clip.start, clip.end, sourceDurationSec);
    setWFrom(w.wFrom);
    setWTo(w.wTo);
  }, [open, clip.clipId, clip.start, clip.end, sourceDurationSec]);

  useEffect(() => {
    if (!open || sourceDurationSec <= 0) {
      return;
    }
    let cancelled = false;
    setPeaksLoading(true);
    setSourcePeaks([]);
    setPeaksDurationSec(0);
    setWaveMeta("");
    setErr(null);
    void (async () => {
      const wfUrl = `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clip.clipId)}/waveform`;
      const res = await apiFetch(wfUrl);
      if (cancelled) {
        return;
      }
      if (res.ok) {
        const body = (await res.json()) as {
          peaks: number[];
          durationSec: number;
          samplesPerSec: number;
        };
        if (cancelled) {
          return;
        }
        setSourcePeaks(body.peaks);
        setPeaksDurationSec(body.durationSec);
        setWaveMeta(`Precomputed ~${body.samplesPerSec}/s`);
        setPeaksLoading(false);
        return;
      }
      const to = Math.min(FALLBACK_AUDIO_CAP, sourceDurationSec);
      if (to <= 0) {
        setPeaksLoading(false);
        return;
      }
      try {
        const res2 = await apiFetch(
          `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clip.clipId)}/audio?from=0&to=${to}`
        );
        if (cancelled || !res2.ok) {
          setPeaksLoading(false);
          if (!cancelled) {
            setErr("No precomputed waveform; audio preview also failed.");
          }
          return;
        }
        const buf = await res2.arrayBuffer();
        if (cancelled) {
          return;
        }
        const wide = 800;
        const p = await decodeWavToPeaks(buf, wide);
        setSourcePeaks(p);
        setPeaksDurationSec(to);
        setWaveMeta(`Fallback first ${to.toFixed(0)}s`);
        setErr(null);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not build waveform");
        }
      } finally {
        if (!cancelled) {
          setPeaksLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId, clip.clipId, sourceDurationSec, clip.start, clip.end]);

  const displayPeaks = useMemo(
    () =>
      peaksForTimeWindow(
        sourcePeaks,
        peaksDurationSec || sourceDurationSec,
        wFrom,
        wTo,
        WAVE_BINS
      ),
    [sourcePeaks, peaksDurationSec, sourceDurationSec, wFrom, wTo]
  );

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) {
        return 0;
      }
      const r = el.getBoundingClientRect();
      return wFrom + ((clientX - r.left) / Math.max(1, r.width)) * (wTo - wFrom);
    },
    [wFrom, wTo]
  );

  const doPatch = useCallback(async () => {
    const a = inRef.current;
    const b = outRef.current;
    if (sourceDurationSec <= 0) {
      return;
    }
    if (b - a < MIN_S - 0.01 || b - a > MAX_S + 0.01) {
      setErr(`Duration must be between ${MIN_S}s and ${MAX_S}s.`);
      return;
    }
    if (a < 0 || b > sourceDurationSec) {
      setErr("Clip is outside source range.");
      return;
    }
    if (Math.abs(a - committedRef.current.start) < 0.01 && Math.abs(b - committedRef.current.end) < 0.01) {
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clip.clipId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: a, end: b }),
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
        setErr(msg);
        setInT(committedRef.current.start);
        setOutT(committedRef.current.end);
        inRef.current = committedRef.current.start;
        outRef.current = committedRef.current.end;
        return;
      }
      const body = JSON.parse(raw) as { clip?: unknown };
      if (body.clip) {
        const next = mergePatchClip(body.clip);
        committedRef.current = { start: next.start, end: next.end };
        onPatched(next);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      setInT(committedRef.current.start);
      setOutT(committedRef.current.end);
      inRef.current = committedRef.current.start;
      outRef.current = committedRef.current.end;
    } finally {
      setSaving(false);
    }
  }, [clip.clipId, jobId, onPatched, sourceDurationSec]);

  useEffect(() => {
    if (activeDrag === null) {
      return;
    }
    let finished = false;
    const onMove = (e: PointerEvent) => {
      const t = timeFromClientX(e.clientX);
      if (sourceDurationSec <= 0) {
        return;
      }
      if (activeDrag === "in") {
        const o = outRef.current;
        const ni = dragIn(t, o, sourceDurationSec);
        setInT(ni);
        inRef.current = ni;
        setPlayhead(ni);
        if (videoRef.current && previewUrl) {
          videoRef.current.currentTime = 0;
        }
      } else {
        const inn = inRef.current;
        const no = dragOut(inn, t, sourceDurationSec);
        setOutT(no);
        outRef.current = no;
        setPlayhead(no);
      }
    };
    const onUp = () => {
      if (finished) {
        return;
      }
      finished = true;
      const ai = inRef.current;
      const bo = outRef.current;
      if (sourceDurationSec > 0) {
        const w0 = pickWindow(ai, bo, sourceDurationSec);
        setWFrom(w0.wFrom);
        setWTo(w0.wTo);
      }
      setActiveDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [activeDrag, timeFromClientX, sourceDurationSec, previewUrl]);

  const onInDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setActiveDrag("in");
  };

  const onOutDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setActiveDrag("out");
  };

  const onTrackClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.handle) {
      return;
    }
    if (!trackRef.current?.contains(e.target as Node)) {
      return;
    }
    const t = timeFromClientX(e.clientX);
    setPlayhead(t);
    if (videoRef.current && previewUrl) {
      const inn = inRef.current;
      const out = outRef.current;
      const rel = Math.max(0, Math.min(out - inn, t - inn));
      videoRef.current.currentTime = rel;
    }
  };

  const range = wTo - wFrom || 1;
  const inPos = ((inT - wFrom) / range) * 100;
  const outPos = ((outT - wFrom) / range) * 100;
  const phPos = ((playhead - wFrom) / range) * 100;

  const wordsInRange = useMemo((): TranscriptWord[] => {
    const w = transcript?.words;
    if (!w?.length) {
      return [];
    }
    return w.filter((x) => x.end > inT - 0.02 && x.start < outT + 0.02);
  }, [transcript, inT, outT]);

  const segmentsInRange = useMemo(() => {
    const segs = transcript?.segments;
    if (!segs?.length) {
      return [];
    }
    return segs.filter((s) => s.end > inT - 0.05 && s.start < outT + 0.05);
  }, [transcript, inT, outT]);

  const loadPlayBuffer = useCallback(async () => {
    if (sourceDurationSec <= 0) {
      return;
    }
    if (audioUrlRef.current) {
      return;
    }
    const wf = wFromRef.current;
    const wt = wToRef.current;
    if (wt <= wf) {
      return;
    }
    try {
      const res = await apiFetch(
        `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clip.clipId)}/audio?from=${wf}&to=${wt}`
      );
      if (!res.ok) {
        return;
      }
      const buf = await res.arrayBuffer();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
      audioUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
      }
    } catch {
      // ignore
    }
  }, [clip.clipId, jobId, sourceDurationSec]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      if (previewUrl && videoRef.current) {
        videoRef.current.pause();
      } else {
        audioRef.current?.pause();
      }
      setIsPlaying(false);
      return;
    }
    if (previewUrl && videoRef.current) {
      const v = videoRef.current;
      const ph = playheadRef.current;
      const inn = inRef.current;
      const out = outRef.current;
      const rel = Math.max(0, Math.min(out - inn, ph - inn));
      v.currentTime = rel;
      void v
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
      return;
    }
    const a = audioRef.current;
    if (!a) {
      return;
    }
    void (async () => {
      if (!audioUrlRef.current) {
        await loadPlayBuffer();
      }
      const a2 = audioRef.current;
      if (!a2 || !audioUrlRef.current) {
        return;
      }
      const ph = playheadRef.current;
      const wf = wFromRef.current;
      const rel = Math.max(0, ph - wf);
      a2.currentTime = rel;
      void a2
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
    })();
  }, [isPlaying, loadPlayBuffer, previewUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !previewUrl) {
      return;
    }
    const onT = () => {
      if (!isPlaying) {
        return;
      }
      const inn = inRef.current;
      const out = outRef.current;
      const abs = inn + v.currentTime;
      if (abs >= out - 0.04) {
        v.pause();
        setIsPlaying(false);
        setPlayhead(out);
        return;
      }
      setPlayhead(abs);
    };
    const onEnd = () => {
      setIsPlaying(false);
      setPlayhead(outRef.current);
    };
    v.addEventListener("timeupdate", onT);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onT);
      v.removeEventListener("ended", onEnd);
    };
  }, [isPlaying, previewUrl]);

  useEffect(() => {
    if (previewUrl) {
      return;
    }
    const a = audioRef.current;
    if (!a) {
      return;
    }
    const onT = () => {
      if (!isPlaying) {
        return;
      }
      setPlayhead(wFrom + a.currentTime);
    };
    const onEnd = () => {
      setIsPlaying(false);
    };
    a.addEventListener("timeupdate", onT);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onT);
      a.removeEventListener("ended", onEnd);
    };
  }, [isPlaying, wFrom, wTo, previewUrl]);

  useEffect(() => {
    if (!open) {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.src = "";
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        void videoRef.current.load();
      }
      setThumbUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      setPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      setIsPlaying(false);
    }
  }, [open]);

  const dur = outT - inT;
  const durValid = dur >= MIN_S - 0.01 && dur <= MAX_S + 0.01;
  const isDirty =
    Math.abs(inT - clip.start) > 0.01 || Math.abs(outT - clip.end) > 0.01;

  const editorHeader = standalone ? (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-zinc-100">Edit clip</h2>
        <p className="line-clamp-1 text-sm font-medium text-zinc-300">
          {clip.suggested_title}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onOpenChange(false)}
          className="h-9"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={() => void doPatch()}
          disabled={saving || !durValid || !isDirty}
          className="h-9"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </Button>
      </div>
    </div>
  ) : (
    <DialogHeader>
      <DialogTitle className="text-base">Edit clip</DialogTitle>
      <p className="line-clamp-1 text-sm font-medium text-zinc-300">
        {clip.suggested_title}
      </p>
    </DialogHeader>
  );

  const editorContent = (
    <>
      {editorHeader}
        {peaksLoading && !previewUrl && (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading waveform…
          </p>
        )}
        {err && <p className="text-sm text-rose-400">{err}</p>}
        {transcriptErr && (
          <p className="text-sm text-amber-400/90">{transcriptErr}</p>
        )}
        {clip.previewReady && !previewUrl && (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
          </p>
        )}
        {!clip.previewReady && !previewUrl && (
          <p className="text-xs text-zinc-500">
            Full preview is encoding — use waveform, transcript, and in/out until it is ready.
          </p>
        )}
        <div className={cn("space-y-4", standalone && "min-h-[calc(100dvh-7rem)]")}>
          <div
            className={cn(
              "grid gap-4 lg:grid-cols-[300px_1fr]",
              standalone && "xl:grid-cols-[380px_minmax(0,1fr)_56px]"
            )}
          >
            <div
              className={cn(
                "rounded-md border border-white/10 bg-zinc-950/70 p-3",
                standalone && "xl:h-[calc(100dvh-14rem)]"
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Transcript
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">
                Word-level sync for this clip window.
              </p>
              <div
                className={cn(
                  "mt-2 max-h-[460px] overflow-auto rounded-md border border-white/5 bg-black/20 p-2",
                  standalone && "max-h-[calc(100dvh-20rem)]"
                )}
              >
                {segmentsInRange.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    {transcript
                      ? "No transcript lines in this in/out range."
                      : "Transcript not loaded."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {segmentsInRange.map((s, i) => {
                      const active = playhead >= s.start && playhead < s.end;
                      return (
                        <p
                          key={`${s.start}-${s.end}-${i}`}
                          className={cn(
                            "rounded px-1.5 py-1 text-xs leading-relaxed text-zinc-300",
                            active && "bg-emerald-500/20 text-emerald-100"
                          )}
                        >
                          <span className="mr-2 font-mono text-[10px] text-zinc-500">
                            {fmtTs(s.start)}
                          </span>
                          {s.text}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {previewUrl ? (
                <div
                  className={cn(
                    "overflow-hidden rounded-md border border-white/10 bg-black",
                    standalone && "flex min-h-[420px] items-center justify-center"
                  )}
                >
                  <video
                    ref={videoRef}
                    className={cn(
                      "aspect-video w-full object-contain",
                      standalone && "mx-auto aspect-[9/16] max-h-[420px] max-w-[260px]"
                    )}
                    playsInline
                    controls={false}
                    src={previewUrl ?? undefined}
                  />
                </div>
              ) : thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl}
                  alt="Clip thumbnail"
                  className={cn(
                    "aspect-video w-full rounded-md border border-white/10 object-cover",
                    standalone && "mx-auto aspect-[9/16] max-h-[420px] max-w-[260px]"
                  )}
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950/60 text-center text-xs text-zinc-500">
                  No preview video yet (thumbnail + waveform only)
                </div>
              )}

              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Audio / Timeline
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-400">
                <span>
                  In {fmtTs(inT)} · Out {fmtTs(outT)} · {fmtTs(outT - inT)} (min {MIN_S}s, max
                  {MAX_S}s) {waveMeta ? `· ${waveMeta}` : ""}
                </span>
                {isDirty && (
                  <span className="text-amber-400/90">Unsaved</span>
                )}
                {!durValid && <span className="text-rose-400">Duration out of range</span>}
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn("h-7 w-7", standalone && "h-8 w-8")}
                    onClick={togglePlay}
                    disabled={peaksLoading && !previewUrl}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div
                ref={trackRef}
                className={cn(
                  "relative h-32 w-full cursor-crosshair select-none overflow-x-visible overflow-y-hidden rounded-md border border-white/10 bg-zinc-900/80",
                  standalone && "h-36"
                )}
                onClick={onTrackClick}
                role="presentation"
              >
                <div className="absolute inset-0 flex items-end justify-between gap-px px-0.5 pb-0 pt-1">
                  {displayPeaks.length === 0 && !peaksLoading ? (
                    <div className="flex w-full items-center justify-center text-[11px] text-zinc-500">
                      No preview
                    </div>
                  ) : (
                    displayPeaks.map((h, i) => (
                      <div
                        key={i}
                        className="min-w-px flex-1 rounded-t bg-cyan-500/40"
                        style={{ height: `${Math.max(4, h * 100)}%` }}
                      />
                    ))
                  )}
                </div>
                <div
                  className="pointer-events-none absolute top-0 bottom-0 border-x border-amber-400/50 bg-amber-400/10"
                  style={{
                    left: `${Math.max(0, inPos)}%`,
                    width: `${Math.max(0, outPos - inPos)}%`,
                  }}
                />
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/30"
                  style={{ left: `${phPos}%` }}
                />
                <div
                  data-handle="in"
                  className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none"
                  style={{ left: `${inPos}%` }}
                  onPointerDown={onInDown}
                >
                  <div className="mx-auto h-full w-1 rounded-sm bg-amber-400" />
                </div>
                <div
                  data-handle="out"
                  className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none"
                  style={{ left: `${outPos}%` }}
                  onPointerDown={onOutDown}
                >
                  <div className="mx-auto h-full w-1 rounded-sm bg-amber-400" />
                </div>
              </div>
              <p className="text-[10px] text-zinc-500">
                Drag in/out — save when ready. Playhead syncs video + transcript + audio.
              </p>
            </div>
            {standalone && (
              <div className="hidden xl:flex xl:flex-col xl:items-center xl:gap-2">
                <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-zinc-400">
                  Captions
                </Button>
                <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-zinc-400">
                  Media
                </Button>
                <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-zinc-400">
                  B-roll
                </Button>
                <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-zinc-400">
                  Text
                </Button>
              </div>
            )}
          </div>
          <audio ref={audioRef} className="hidden" />
          <div className={cn("flex justify-end gap-2", standalone && "hidden")}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void doPatch()}
              disabled={saving || !durValid || !isDirty}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
    </>
  );

  if (standalone) {
    return (
      <div className="w-full px-4 py-4 sm:px-6 sm:py-6">
        {editorContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,900px)] max-w-3xl overflow-y-auto sm:max-w-3xl">
        {editorContent}
      </DialogContent>
    </Dialog>
  );
}
