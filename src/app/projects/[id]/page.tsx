"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import type { StoredTranscript } from "@/lib/transcription/transcript-types";
import { JobStatusBadge, ProjectStatusBadge } from "@/components/projects/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cloud, FileJson, Link2, Loader2, Mic, Table2, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

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

type ClipEntry = {
  clipId: string;
  start: number;
  end: number;
  score: number;
  transcript_excerpt: string;
  suggested_title: string;
  selected?: boolean;
};

function ProjectDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [project, setProject] = useState<ProjectView | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [importTab, setImportTab] = useState<"file" | "url">("file");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptJobId, setTranscriptJobId] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<StoredTranscript | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptFetchError, setTranscriptFetchError] = useState<string | null>(
    null
  );
  const [aiOpen, setAiOpen] = useState(false);
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiClips, setAiClips] = useState<ClipEntry[]>([]);
  const [aiThumbUrls, setAiThumbUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisTriggeredRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoadError(null);
    const res = await apiFetch(`/api/projects/${id}`);
    const body = (await res.json().catch(() => ({}))) as {
      project?: ProjectView;
      jobs?: JobRow[];
      error?: string;
    };
    if (res.status === 404) {
      setLoadError("Project not found.");
      setProject(null);
      return;
    }
    if (!res.ok) {
      setLoadError(body.error ?? "Could not load project");
      return;
    }
    if (body.project) {
      setProject(body.project);
    }
    setJobs(body.jobs ?? []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const ingestParam = searchParams.get("ingest");
  useEffect(() => {
    if (ingestParam) {
      setUrl(ingestParam);
      setImportTab("url");
    }
  }, [ingestParam]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const ms = toast.length > 120 ? 4500 : 2000;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function openTranscriptViewer(jobId: string) {
    setTranscriptJobId(jobId);
    setTranscriptOpen(true);
    setTranscriptData(null);
    setTranscriptFetchError(null);
    setTranscriptLoading(true);
    try {
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/transcript`);
      const raw = await res.text();
      if (!res.ok) {
        let msg = raw;
        try {
          const j = JSON.parse(raw) as { error?: string };
          if (j.error) {
            msg = j.error;
          }
        } catch {
          // use raw
        }
        setTranscriptFetchError(msg);
        return;
      }
      setTranscriptData(JSON.parse(raw) as StoredTranscript);
    } catch (e) {
      setTranscriptFetchError(
        e instanceof Error ? e.message : "Could not load transcript"
      );
    } finally {
      setTranscriptLoading(false);
    }
  }

  async function openAiViewer(jobId: string) {
    setAiJobId(jobId);
    setAiOpen(true);
    setAiLoading(true);
    setAiError(null);
    setAiClips([]);
    try {
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`);
      const raw = await res.text();
      if (!res.ok) {
        let msg = raw;
        try {
          const j = JSON.parse(raw) as { error?: string };
          if (j.error) {
            msg = j.error;
          }
        } catch {
          // use raw
        }
        setAiError(msg);
        return;
      }
      const body = JSON.parse(raw) as ClipEntry[] | { clips?: ClipEntry[] };
      const clips = Array.isArray(body) ? body : (body.clips ?? []);
      setAiClips(clips);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Could not load AI results");
    } finally {
      setAiLoading(false);
    }
  }

  async function setClipSelection(jobId: string, clipId: string, selected: boolean) {
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
          // use raw
        }
        setAiError(msg);
        return;
      }
      setAiError(null);
      setAiClips((prev) =>
        prev.map((c) => (c.clipId === clipId ? { ...c, selected } : c))
      );
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Could not update clip selection");
    }
  }

  useEffect(() => {
    if (!aiOpen || !aiJobId || aiClips.length === 0) {
      return;
    }
    let cancelled = false;
    const created: string[] = [];

    const run = async () => {
      const entries: Array<[string, string]> = [];
      await Promise.all(
        aiClips.map(async (clip) => {
        try {
          const res = await apiFetch(
            `/api/jobs/${encodeURIComponent(aiJobId)}/clips/${encodeURIComponent(
              clip.clipId
            )}/thumbnail`
          );
          if (!res.ok) {
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          created.push(url);
          entries.push([clip.clipId, url]);
        } catch {
          // keep missing thumbnail silent per-clip
        }
        })
      );
      if (cancelled) {
        for (const u of created) {
          URL.revokeObjectURL(u);
        }
        return;
      }
      setAiThumbUrls((prev) => {
        for (const old of Object.values(prev)) {
          URL.revokeObjectURL(old);
        }
        return Object.fromEntries(entries);
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [aiOpen, aiJobId, aiClips]);

  function fmtTs(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function segmentConfidence(start: number, end: number): number | null {
    if (!transcriptData || transcriptData.words.length === 0) {
      return null;
    }
    const inRange = transcriptData.words.filter((w) => w.start >= start && w.end <= end);
    if (inRange.length === 0) {
      return null;
    }
    const avg = inRange.reduce((sum, w) => sum + w.confidence, 0) / inRange.length;
    return avg;
  }

  async function runTranscriptionForJob(jobId: string) {
    setRunningJobId(jobId);
    setMessage(null);
    try {
      const res = await apiFetch(
        `/api/worker/transcribe?jobId=${encodeURIComponent(jobId)}`,
        {
        method: "POST",
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        processed?: number;
        errors?: string[];
        ok?: boolean;
        jobId?: string;
      };
      if (!res.ok) {
        setMessage({
          kind: "err",
          text: body.error ?? body.errors?.[0] ?? `Transcription worker failed (${res.status})`,
        });
        setRunningJobId(null);
        return;
      }
      setToast(`Transcription started for job ${body.jobId ?? jobId}.`);
      void pollJobStatus(jobId);
      await load();
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message : "Worker request failed",
      });
      setRunningJobId(null);
    }
  }

  async function pollJobStatus(jobId: string) {
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => window.setTimeout(r, 2500));
      try {
        const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/status`);
        if (!res.ok) {
          setRunningJobId(null);
          return;
        }
        const s = (await res.json()) as {
          status?: string;
          progress?: number;
          updatedAt?: string;
          error?: string;
        };
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: s.status ?? job.status,
                  progress: s.progress ?? job.progress,
                  updatedAt: s.updatedAt ?? job.updatedAt,
                  error: s.error ?? job.error,
                }
              : job
          )
        );
        if (s.status === "failed") {
          setRunningJobId(null);
          await load();
          return;
        }
        if (s.status === "clips_ready") {
          setRunningJobId(null);
          await load();
          return;
        }
        if (
          s.status === "transcript_complete" &&
          !analysisTriggeredRef.current.has(jobId)
        ) {
          analysisTriggeredRef.current.add(jobId);
          const a = await apiFetch(
            `/api/worker/analyze?jobId=${encodeURIComponent(jobId)}`,
            { method: "POST" }
          );
          if (!a.ok) {
            setRunningJobId(null);
            void load();
            return;
          }
        }
      } catch {
        setRunningJobId(null);
        return;
      }
    }
    setRunningJobId(null);
  }

  async function runAnalysisForJobRow(jobId: string) {
    setRunningJobId(jobId);
    setMessage(null);
    analysisTriggeredRef.current.add(jobId);
    try {
      const res = await apiFetch(
        `/api/worker/analyze?jobId=${encodeURIComponent(jobId)}`,
        { method: "POST" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: string[];
        ok?: boolean;
        jobId?: string;
      };
      if (!res.ok) {
        setMessage({
          kind: "err",
          text: body.error ?? body.errors?.[0] ?? `Analysis worker failed (${res.status})`,
        });
        setRunningJobId(null);
        return;
      }
      setToast(`AI analysis started for job ${body.jobId ?? jobId}.`);
      void pollJobStatus(jobId);
      await load();
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message : "Analysis request failed",
      });
      setRunningJobId(null);
    }
  }

  async function submitFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !id) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(`/api/projects/${id}/upload`, {
      method: "POST",
      body: fd,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; jobId?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage({ kind: "err", text: body.error ?? "Upload failed" });
      return;
    }
    setFile(null);
    setMessage(null);
    setToast(`Upload queued. Job id: ${body.jobId ?? "—"}`);
    await load();
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!id) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await apiFetch(`/api/projects/${id}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; jobId?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage({ kind: "err", text: body.error ?? "Could not queue URL" });
      return;
    }
    setUrl("");
    setMessage(null);
    setToast(`Link import queued. Job id: ${body.jobId ?? "—"}`);
    await load();
  }

  if (loadError === "Project not found.") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] sm:p-10">
          <p className="text-sm text-zinc-400">{loadError}</p>
          <Button asChild variant="glow" size="sm" className="mt-5">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!project && !loadError) {
    return (
      <div
        className="flex min-h-[38vh] items-center justify-center rounded-2xl border border-dashed border-zinc-800/50 bg-zinc-950/30 p-8"
        aria-busy
      >
        <p className="flex items-center gap-2.5 text-sm text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" /> Loading project…
        </p>
      </div>
    );
  }

  if (loadError && !project) {
    return (
      <Alert variant="destructive" className="border-rose-500/30 bg-rose-500/5">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="w-full space-y-10 pb-2 lg:space-y-12">
      <header className="pt-2">
        <div className="space-y-3 text-center">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {project.name}
            </h1>
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
      </header>

      {message?.kind === "err" && (
        <Alert
          variant="destructive"
          className={cn(
            "rounded-xl",
            "border-rose-500/30"
          )}
        >
          <AlertTitle className="text-sm">Error</AlertTitle>
          <AlertDescription className="text-sm">{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="mx-auto w-full max-w-3xl">
        <input
          id="project-video"
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept="video/mp4,video/quicktime,video/webm,.mkv,video/x-matroska"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Tabs
          value={importTab}
          onValueChange={(v) => setImportTab(v as "file" | "url")}
          className="w-full"
        >
        <div className="flex justify-center">
          <TabsList
            className={cn(
              "grid h-11 w-full max-w-md grid-cols-2 gap-0.5 p-1 sm:w-[440px] sm:max-w-[440px]",
              "rounded-xl border border-zinc-800/80 bg-zinc-900/40"
            )}
          >
          <TabsTrigger
            value="file"
            className="gap-2 rounded-lg data-[state=active]:bg-zinc-800/90 data-[state=active]:shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Upload file
          </TabsTrigger>
          <TabsTrigger
            value="url"
            className="gap-2 rounded-lg data-[state=active]:bg-zinc-800/90 data-[state=active]:shadow-sm"
          >
            <Link2 className="h-4 w-4" />
            From link
          </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="file" className="mt-6 focus-visible:outline-none">
          <form
            onSubmit={submitFile}
            className="w-full rounded-2xl border border-white/10 bg-zinc-900/50 p-4 sm:p-5"
          >
            <div className="relative">
              <Upload
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <label
                htmlFor="project-video"
                className="flex h-12 w-full cursor-pointer items-center overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 pl-10 pr-3"
              >
                <span className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground">
                  {file ? file.name : "No file chosen — click to browse"}
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  title="Cloud import is not available in this build"
                  disabled
                >
                  <Cloud className="h-4 w-4" />
                  Google Drive
                </Button>
              </div>
              <Button
                type="submit"
                className="h-11 min-w-[180px] rounded-xl bg-foreground text-background hover:bg-foreground/90"
                disabled={busy || !file}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working…
                  </>
                ) : (
                  "Upload & queue"
                )}
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Multipart upload · MP4, MOV, MKV, WebM · up to 2 GB. Set R2 in{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">.env.local</code> or{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">
              OBJECT_STORE_LOCAL=1
            </code>{" "}
            for local disk.
          </p>
        </TabsContent>
        <TabsContent value="url" className="mt-6 focus-visible:outline-none">
          <form
            onSubmit={submitUrl}
            className="w-full rounded-2xl border border-white/10 bg-zinc-900/50 p-4 sm:p-5"
          >
            <div className="relative">
              <Link2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="project-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="Drop a YouTube link"
                className="h-12 border-white/10 bg-zinc-950/80 pl-10 pr-3 text-sm"
                type="url"
                name="ingest"
                autoComplete="url"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setImportTab("file");
                    requestAnimationFrame(() => fileInputRef.current?.click());
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  title="Cloud import is not available in this build"
                  disabled
                >
                  <Cloud className="h-4 w-4" />
                  Google Drive
                </Button>
              </div>
              <Button
                type="submit"
                className="h-11 min-w-[180px] rounded-xl bg-foreground text-background hover:bg-foreground/90"
                disabled={busy || !url.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working…
                  </>
                ) : (
                  "Get clips in 1 click"
                )}
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-zinc-500">
            YouTube, Instagram, or Facebook public links — queued in the async pipeline.
          </p>
        </TabsContent>
      </Tabs>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-3 rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-violet-500/15 p-2 text-violet-300">
            <Mic className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">Transcription &amp; AI clips (US-05+)</p>
            <p className="text-xs text-zinc-500">
              <span className="text-zinc-400">Transcribe:</span> FFmpeg → Deepgram — use{" "}
              <span className="text-zinc-400">Run</span> on a row. <span className="text-zinc-400">AI:</span> when
              the transcript is ready, <span className="text-zinc-400">Run AI</span> runs segment scoring
              and builds the clip manifest (or it starts automatically right after transcribe). Terminal
              logs: <code className="rounded bg-white/5 px-1">[transcription:US-05]</code> and{" "}
              <code className="rounded bg-white/5 px-1">[analysis:US-07-08]</code>
              .
            </p>
          </div>
        </div>
      </div>

      <section className="mx-auto w-full max-w-6xl space-y-4" aria-label="Project jobs">
        <div className="flex items-center gap-2.5 text-sm font-medium text-zinc-400">
          <Table2 className="h-4 w-4 text-zinc-500" />
          <span>Recent jobs</span>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800/60 bg-zinc-950/30 py-12 text-center text-sm text-zinc-500">
            No jobs yet. Upload a file or add a link.
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-950/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]"
            role="region"
            aria-label="Jobs list"
          >
            <table className="w-full min-w-[980px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[46%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-800/80 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  <th scope="col" className="p-3.5 pl-4">
                    Type
                  </th>
                  <th scope="col" className="p-3.5">
                    Status
                  </th>
                  <th scope="col" className="p-3.5">
                    Source
                  </th>
                  <th scope="col" className="p-3.5 pr-4">
                    Created
                  </th>
                  <th scope="col" className="p-3.5 pr-4">
                    Run
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-zinc-800/40 last:border-0"
                  >
                    <td className="p-3.5 pl-4 align-top font-mono text-xs uppercase tracking-wide text-zinc-400">
                      {j.jobType}
                    </td>
                    <td className="p-3.5 align-top">
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className="p-3.5 align-top text-xs text-zinc-400">
                      <span className="block break-all">
                        {j.sourceUrl ? "Video link" : j.objectKey ? "File upload" : "—"}
                      </span>
                      {(j.status === "transcript_complete" ||
                        j.status === "analysis_complete" ||
                        j.status === "clips_ready") && (
                        <>
                          <Button
                            type="button"
                            variant="link"
                            className="mt-1.5 h-auto p-0 text-xs text-cyan-400"
                            onClick={() => void openTranscriptViewer(j.id)}
                          >
                            <FileJson className="mr-1 h-3.5 w-3.5" />
                            View transcript JSON
                          </Button>
                          {(j.status === "analysis_complete" ||
                            j.status === "clips_ready") && (
                            <Button
                              type="button"
                              variant="link"
                              className="mt-1.5 h-auto p-0 text-xs text-emerald-400"
                              onClick={() => void openAiViewer(j.id)}
                            >
                              <FileJson className="mr-1 h-3.5 w-3.5" />
                              View AI clips
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3.5 pr-4 align-top text-xs text-zinc-500">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 pr-4 align-top">
                      {j.status === "clips_ready" ? (
                        <Button type="button" variant="outline" size="sm" disabled>
                          Completed
                        </Button>
                      ) : j.status === "transcript_complete" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={runningJobId !== null}
                          onClick={() => void runAnalysisForJobRow(j.id)}
                        >
                          {runningJobId === j.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Running…
                            </>
                          ) : (
                            "Run AI"
                          )}
                        </Button>
                      ) : j.status === "queued" || j.status === "failed" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={runningJobId !== null}
                          onClick={() => void runTranscriptionForJob(j.id)}
                        >
                          {runningJobId === j.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Running…
                            </>
                          ) : (
                            "Run"
                          )}
                        </Button>
                      ) : runningJobId === j.id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Working…
                        </span>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled>
                          —
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-xl border border-emerald-500/30 bg-zinc-950/95 px-4 py-2 text-sm text-emerald-300 shadow-lg shadow-emerald-500/10 backdrop-blur">
          {toast}
        </div>
      )}

      <Dialog
        open={transcriptOpen}
        onOpenChange={(o) => {
          setTranscriptOpen(o);
          if (!o) {
            setTranscriptJobId(null);
            setTranscriptData(null);
            setTranscriptFetchError(null);
          }
        }}
      >
        <DialogContent className="max-h-[min(80vh,720px)] max-w-3xl overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Transcript
              {transcriptJobId ? (
                <span className="ml-2 font-mono text-xs text-zinc-500">
                  {transcriptJobId}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {transcriptLoading && (
            <p className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {transcriptFetchError && (
            <p className="text-sm text-rose-400">{transcriptFetchError}</p>
          )}
          {transcriptData && !transcriptLoading && (
            <div className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <span>Provider: {transcriptData.provider}</span>
                <span className="ml-3">Language: {transcriptData.language}</span>
              </div>
              <div className="max-h-[min(60vh,560px)] space-y-2 overflow-auto rounded-lg border border-white/10 bg-zinc-950/80 p-3">
                {transcriptData.segments.length === 0 ? (
                  <p className="text-xs text-zinc-500">No transcript segments available.</p>
                ) : (
                  transcriptData.segments.map((seg, idx) => {
                    const conf = segmentConfidence(seg.start, seg.end);
                    return (
                      <div key={`${seg.start}-${seg.end}-${idx}`} className="rounded-md border border-white/5 bg-white/[0.02] p-2.5">
                        <p className="mb-1 flex items-center justify-between gap-3 text-[11px] font-mono text-cyan-400/90">
                          [{fmtTs(seg.start)} - {fmtTs(seg.end)}]
                          {conf !== null && (
                            <span className="text-zinc-400">score: {(conf * 100).toFixed(1)}%</span>
                          )}
                        </p>
                        <p className="text-sm leading-relaxed text-zinc-200">{seg.text}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={aiOpen}
        onOpenChange={(o) => {
          setAiOpen(o);
          if (!o) {
            setAiJobId(null);
            setAiError(null);
            setAiClips([]);
            setAiThumbUrls((prev) => {
              for (const url of Object.values(prev)) {
                URL.revokeObjectURL(url);
              }
              return {};
            });
          }
        }}
      >
        <DialogContent className="max-h-[min(84vh,760px)] max-w-4xl overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              AI Results
              {aiJobId ? (
                <span className="ml-2 font-mono text-xs text-zinc-500">{aiJobId}</span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {aiLoading && (
            <p className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {aiError && <p className="text-sm text-rose-400">{aiError}</p>}
          {!aiLoading && !aiError && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Ranked Clips ({aiClips.length}) · Selected{" "}
                {aiClips.filter((c) => c.selected !== false).length}
              </p>
              <div className="max-h-[56vh] space-y-2 overflow-auto rounded-lg border border-white/10 bg-zinc-950/80 p-3">
                {aiClips.length === 0 ? (
                  <p className="text-xs text-zinc-500">No clip manifest entries found.</p>
                ) : (
                  aiClips.map((c) => (
                    <div
                      key={c.clipId}
                      className={cn(
                        "rounded-md border p-2.5",
                        c.selected === false
                          ? "border-rose-500/30 bg-rose-500/[0.03]"
                          : "border-white/5 bg-white/[0.02]"
                      )}
                    >
                      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                        {aiThumbUrls[c.clipId] ? (
                          <img
                            src={aiThumbUrls[c.clipId]}
                            alt={`${c.suggested_title} thumbnail`}
                            className="h-24 w-full rounded border border-white/10 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-24 w-full items-center justify-center rounded border border-white/10 bg-zinc-900 text-[11px] text-zinc-500">
                            Loading thumbnail…
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-emerald-300">
                            {c.suggested_title} · {(c.score * 100).toFixed(1)}%
                          </p>
                          <p className="mt-1 text-[11px] font-mono text-zinc-400">
                            [{fmtTs(c.start)} - {fmtTs(c.end)}]
                          </p>
                          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-300">
                            {c.transcript_excerpt}
                          </p>
                          <div className="mt-2">
                            {c.selected === false ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  aiJobId
                                    ? void setClipSelection(aiJobId, c.clipId, true)
                                    : undefined
                                }
                              >
                                Keep clip
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  aiJobId
                                    ? void setClipSelection(aiJobId, c.clipId, false)
                                    : undefined
                                }
                              >
                                Deselect
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[38vh] items-center justify-center rounded-2xl border border-dashed border-zinc-800/50 bg-zinc-950/30 p-8"
          aria-busy
        >
          <p className="flex items-center gap-2.5 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400" /> Loading project…
          </p>
        </div>
      }
    >
      <ProjectDetailContent />
    </Suspense>
  );
}
