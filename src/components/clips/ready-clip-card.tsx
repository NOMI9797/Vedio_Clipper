"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Scissors, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClipEntry } from "@/lib/clips/clip-entry";
import { cn } from "@/lib/utils";

function formatClock(seconds: number): string {
  const t = Math.max(0, seconds);
  if (!Number.isFinite(t) || t <= 0) {
    return "00:00";
  }
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  clip: ClipEntry;
  previewUrl: string | null;
  thumbUrl: string | null;
  captionWords?: Array<{ start: number; end: number; word: string }>;
  hookText?: string;
  isSelected?: boolean;
  onSelect?: () => void;
  isActive?: boolean;
  onSetActive: (clipId: string | null) => void;
  onEdit: () => void;
  onDownload: () => void;
  onToggleSelect?: (selected: boolean) => void;
  fmtDuration: (lenSec: number) => string;
  className?: string;
};

export function ReadyClipCard({
  clip: c,
  previewUrl,
  thumbUrl,
  captionWords,
  hookText,
  isSelected = false,
  onSelect,
  isActive = false,
  onSetActive,
  onEdit,
  onDownload,
  onToggleSelect,
  fmtDuration,
  className,
}: Props) {
  const vRef = useRef<HTMLVideoElement | null>(null);
  const [hover, setHover] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const lenSec = c.end - c.start;
  const scoreDisplay = c.score != null ? Math.round(c.score * 100) : null;
  const absT = c.start + cur;
  const activeCaption =
    captionWords?.find((w) => absT >= w.start && absT < w.end)?.word ?? "";

  useEffect(() => {
    if (!isActive && vRef.current && !vRef.current.paused) {
      vRef.current.pause();
    }
  }, [isActive]);

  useEffect(() => {
    const v = vRef.current;
    if (v && previewUrl) {
      v.load();
    }
  }, [previewUrl]);

  const syncTime = useCallback(() => {
    const v = vRef.current;
    if (!v) {
      return;
    }
    setCur(v.currentTime);
    if (v.duration && Number.isFinite(v.duration)) {
      setDur(v.duration);
    }
  }, []);

  const onVideoPlay = useCallback(() => {
    setPlaying(true);
  }, []);
  const onVideoPause = useCallback(() => {
    setPlaying(false);
  }, []);
  const onVideoEnded = useCallback(() => {
    setPlaying(false);
    onSetActive(null);
  }, [onSetActive]);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const v = vRef.current;
      if (!v || !previewUrl) {
        return;
      }
      if (playing) {
        v.pause();
        onSetActive(null);
        return;
      }
      onSetActive(c.clipId);
      v.muted = false;
      const playNow = () => {
        const el = vRef.current;
        if (!el) {
          return;
        }
        el.muted = false;
        void el.play().catch(() => undefined);
      };
      requestAnimationFrame(() => {
        playNow();
        requestAnimationFrame(playNow);
      });
    },
    [c.clipId, onSetActive, playing, previewUrl]
  );

  const scoreColor =
    scoreDisplay != null
      ? scoreDisplay >= 80
        ? "text-emerald-400"
        : scoreDisplay >= 60
          ? "text-yellow-400"
          : "text-orange-400"
      : "text-zinc-500";

  return (
    <div
      className={cn(
        "group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-lg transition-all duration-200",
        c.selected === false
          ? "opacity-40 grayscale"
          : "hover:border-zinc-600 hover:shadow-xl hover:shadow-black/50",
        isSelected && "ring-2 ring-emerald-500/60 border-emerald-500/40",
        className
      )}
      onClick={onSelect}
    >
      {/* Video / thumbnail area */}
      <div
        className="relative aspect-[9/16] w-full overflow-hidden bg-black"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {previewUrl ? (
          <video
            key={previewUrl}
            ref={vRef}
            className="h-full w-full object-cover"
            src={previewUrl}
            playsInline
            muted={!isActive}
            preload="none"
            onTimeUpdate={syncTime}
            onPlay={onVideoPlay}
            onPause={onVideoPause}
            onEnded={onVideoEnded}
            onLoadedData={syncTime}
            onLoadedMetadata={() => {
              const v = vRef.current;
              if (v && Number.isFinite(v.duration)) {
                setDur(v.duration);
              }
            }}
          />
        ) : thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-900 px-2 text-center text-xs text-zinc-500">
            {c.previewReady !== true ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
                <span>Encoding...</span>
              </div>
            ) : (
              "No media"
            )}
          </div>
        )}

        {/* Hook text overlay at top */}
        {hookText && (
          <div className="absolute left-1/2 top-2 z-[6] max-w-[92%] -translate-x-1/2 rounded-lg bg-white/95 px-2.5 py-1.5 text-center text-[11px] font-bold leading-tight text-black shadow-lg backdrop-blur-sm sm:text-xs">
            {hookText}
          </div>
        )}

        {/* Play / pause overlay */}
        {previewUrl && !playing && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
              "bg-black/30 max-md:opacity-100",
              "md:opacity-0 md:group-hover:opacity-100"
            )}
          >
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-12 w-12 rounded-full border-0 bg-white/95 p-0 text-black shadow-xl hover:bg-white hover:scale-110 transition-transform"
              onClick={togglePlay}
              aria-label="Play clip"
            >
              <Play className="h-5 w-5 fill-current ml-0.5" />
            </Button>
          </div>
        )}

        {previewUrl && playing && hover && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-10 w-10 rounded-full border-0 bg-white/90 p-0 text-black shadow-lg"
              onClick={togglePlay}
              aria-label="Pause"
            >
              <Pause className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Duration badge top-right */}
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 select-none rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-white/90 backdrop-blur-sm sm:text-[11px]">
          {dur > 0 ? (
            <span>{formatClock(cur)} {formatClock(dur)}</span>
          ) : (
            <span>00:00 {fmtDuration(lenSec)}</span>
          )}
        </div>

        {/* Progress bar */}
        {dur > 0 && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-100"
              style={{ width: `${dur > 0 ? (cur / dur) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Badges */}
        {c.edited && (
          <div className="absolute left-1.5 top-1.5 z-[5] rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black sm:text-[10px]">
            Edited
          </div>
        )}
        {c.manual && (
          <div className="absolute bottom-2 left-1.5 z-10 rounded-md bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white sm:text-[10px]">
            Manual
          </div>
        )}

        {/* Live caption during playback */}
        {activeCaption && playing && (
          <div className="pointer-events-none absolute inset-x-2 bottom-4 z-10 rounded-md bg-black/60 px-2 py-1.5 text-center text-sm font-extrabold uppercase leading-tight text-emerald-400 backdrop-blur-sm">
            {activeCaption}
          </div>
        )}
      </div>

      {/* Score + actions row */}
      <div className="flex items-center justify-between gap-1 px-3 pt-2.5 pb-1">
        <span className={cn("text-2xl font-black tabular-nums leading-none", scoreColor)}>
          {scoreDisplay ?? "—"}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-sky-400"
            title="Download preview"
            disabled={!previewUrl}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-cyan-400"
            title="Edit clip"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Scissors className="h-3.5 w-3.5" />
          </Button>
          {onToggleSelect && c.selected !== false && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-rose-400"
              title="Exclude clip"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Title + excerpt */}
      <div className="px-3 pb-3">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-100">
          {c.suggested_title}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500">
          {c.transcript_excerpt}
        </p>
      </div>

      {/* Include button for excluded clips */}
      {onToggleSelect && c.selected === false && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(true);
            }}
          >
            Include
          </Button>
        </div>
      )}
    </div>
  );
}
