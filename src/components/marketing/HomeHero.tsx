"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clapperboard, Link2, Upload } from "lucide-react";

type Props = { authed: boolean };

export function HomeHero({ authed }: Props) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");

  function onGetClips(e: React.FormEvent) {
    e.preventDefault();
    const q = videoUrl.trim();
    if (authed) {
      router.push(q ? `/projects?import=${encodeURIComponent(q)}` : "/projects");
      return;
    }
    if (q && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("vedioclipper:pendingUrl", q);
    }
    router.push("/register");
  }

  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500 sm:text-sm">
        AI video workspace
      </p>
      <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
        One long video.{" "}
        <span className="text-gradient-hero">Clips that hit different.</span>
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
        Turn long-form into shorts with transcription, smart cuts, and a studio
        built for speed — inspired by the best clippers in the game.
      </p>

      <form
        onSubmit={onGetClips}
        className="mx-auto mt-10 flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-stretch"
      >
        <div className="flex min-h-12 flex-1 items-center gap-2 rounded-full border border-white/10 bg-zinc-950/80 p-1.5 pl-3 shadow-lg shadow-black/20 sm:rounded-r-none sm:pl-4">
          <Link2
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="url"
            name="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Drop a video link"
            className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-foreground shadow-none placeholder:text-zinc-500 focus-visible:ring-0"
          />
        </div>
        <Button
          type="submit"
          className="h-12 shrink-0 rounded-full bg-white px-6 text-sm font-semibold text-zinc-950 hover:bg-white/95 sm:rounded-l-none sm:rounded-r-full"
        >
          Get free clips
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>or</span>
        <Button
          asChild
          type="button"
          variant="outline"
          className="rounded-full border-white/20 bg-transparent px-5 text-foreground hover:bg-white/5"
        >
          <Link href={authed ? "/projects" : "/register"}>
            <Upload className="mr-2 h-4 w-4" />
            Upload files
          </Link>
        </Button>
      </div>

      <div className="mt-12 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/40 shadow-2xl shadow-black/50">
        <div className="border-b border-white/5 bg-zinc-900/30 px-4 py-3">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <div className="flex h-2 w-2 rounded-full bg-red-500/80" />
            <div className="flex h-2 w-2 rounded-full bg-amber-500/80" />
            <div className="flex h-2 w-2 rounded-full bg-emerald-500/80" />
          </div>
        </div>
        <div className="flex aspect-[16/9] items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-lg rounded-xl border border-dashed border-white/10 bg-gradient-to-b from-zinc-900/50 to-zinc-950/80 p-6 text-left">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Studio preview
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Ingest, transcribe, and export — your pipeline will appear here as
              milestones ship.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
              <Clapperboard className="h-4 w-4 text-violet-400/80" />
              <span className="text-xs text-zinc-500">Waiting for your first project…</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
