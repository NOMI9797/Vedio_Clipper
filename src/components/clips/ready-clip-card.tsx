"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, Download, Pause, Play, Scissors, Share2 } from "lucide-react";

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
  /** This clip is allowed to play with sound (one at a time). */
  isActive?: boolean;
  onSetActive: (clipId: string | null) => void;
  onEdit: () => void;
  onDownload: () => void;
  onToggleSelect?: (selected: boolean) => void;
  fmtDuration: (lenSec: number) => string;
  /** Disable play overlay on md+ when not hovering (always show on touch) */
  className?: string;
};

export function ReadyClipCard({
  clip: c,
  previewUrl,
  thumbUrl,
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

  return (
    <div
      className={cn(
        "group flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 shadow-md shadow-black/40 transition",
        c.selected === false
          ? "opacity-50 ring-1 ring-rose-500/20"
          : "hover:border-zinc-600",
        className
      )}
    >
      <div
        className="relative aspect-[9/16] w-full max-h-[200px] overflow-hidden bg-black"
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
            preload="auto"
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
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 px-1 text-center text-[10px] text-zinc-500">
            {c.previewReady !== true ? "Encoding preview…" : "No media"}
          </div>
        )}

        {previewUrl && !playing && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity",
              "bg-black/20 max-md:opacity-100",
              "md:opacity-0 md:group-hover:opacity-100"
            )}
          >
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full border-0 bg-white/90 p-0 text-black shadow-md hover:bg-white"
              onClick={togglePlay}
              aria-label="Play clip with sound"
            >
              <Play className="h-4 w-4 fill-current" />
            </Button>
          </div>
        )}

        {previewUrl && playing && hover && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full border-0 bg-white/90 p-0 text-black shadow-md"
              onClick={togglePlay}
              aria-label="Pause"
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="pointer-events-none absolute right-1 top-1 z-10 select-none rounded bg-black/80 px-1 py-0.5 font-mono text-[8px] leading-tight text-white sm:text-[9px]">
          {dur > 0 ? (
            <span>
              {formatClock(cur)} {formatClock(dur)}
            </span>
          ) : (
            <span>00:00 {fmtDuration(lenSec)}</span>
          )}
        </div>

        {dur > 0 && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800/80">
            <div
              className="h-full bg-white/90"
              style={{ width: `${dur > 0 ? (cur / dur) * 100 : 0}%` }}
            />
          </div>
        )}

        {c.edited && (
          <div className="absolute left-0.5 top-0.5 z-[5] max-w-[46%] truncate rounded bg-amber-500/95 px-0.5 py-px text-[6px] font-bold uppercase text-black sm:text-[7px]">
            Edited
          </div>
        )}
        {c.manual && (
          <div className="absolute bottom-4 left-1 z-10 rounded bg-amber-600/90 px-1 py-px text-[7px] font-bold uppercase text-white sm:text-[8px]">
            Manual
          </div>
        )}
      </div>

      <div className="flex min-h-7 items-center justify-between gap-0 px-0.5 py-0.5">
        {scoreDisplay != null ? (
          <span className="pl-0.5 text-base font-bold leading-none tabular-nums text-emerald-400 sm:text-lg">
            {scoreDisplay}
          </span>
        ) : (
          <span className="pl-0.5 text-sm font-bold text-zinc-500">—</span>
        )}
        <div className="flex shrink-0 items-center -space-x-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-rose-400/90 p-0"
            title="Schedule (soon)"
            disabled
          >
            <Calendar className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 p-0 text-sky-400/90"
            title="Download preview"
            disabled={!previewUrl}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 p-0 text-cyan-400/90"
            title="Edit clip"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Scissors className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 p-0 text-zinc-500"
            title="Share (soon)"
            disabled
          >
            <Share2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="px-1 pb-0.5">
        <p className="line-clamp-2 text-[9px] font-semibold leading-tight text-zinc-100 sm:text-[10px]">
          {c.suggested_title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-zinc-500 sm:text-[9px]">
          {c.transcript_excerpt}
        </p>
        {onToggleSelect && (
          <div className="mt-1">
            {c.selected === false ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-5 w-full px-0.5 text-[8px] sm:text-[9px]"
                onClick={() => onToggleSelect(true)}
              >
                Include
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-5 w-full px-0.5 text-[8px] sm:text-[9px]"
                onClick={() => onToggleSelect(false)}
              >
                Exclude
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
