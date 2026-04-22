"use client";

import { useCallback, useEffect, useState } from "react";

import { HomeHero } from "@/components/marketing/HomeHero";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { getAccessToken } from "@/lib/auth/client-tokens";
import { Mic2, Scissors, Zap } from "lucide-react";

const features = [
  {
    title: "Ingest at scale",
    body: "Upload pro formats or import from public links. Built for long-form content.",
    icon: Mic2,
  },
  {
    title: "AI-first pipeline",
    body: "Transcribe, score, and cut with async jobs—never block the editor.",
    icon: Scissors,
  },
  {
    title: "Ship faster",
    body: "Opus-style flow: from rough cut to social-ready clips in one workspace.",
    icon: Zap,
  },
] as const;

export function HomePageClient() {
  const [authed, setAuthed] = useState(false);

  const sync = useCallback(() => {
    setAuthed(!!getAccessToken());
  }, []);

  useEffect(() => {
    sync();
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("vedioclipper:auth", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("vedioclipper:auth", sync);
      window.removeEventListener("focus", sync);
    };
  }, [sync]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <HomeHero authed={authed} />
        <ul className="mt-20 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <li
              key={f.title}
              className="surface-glass rounded-2xl p-5 transition hover:border-cyan-500/20"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-200">
                <f.icon className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
