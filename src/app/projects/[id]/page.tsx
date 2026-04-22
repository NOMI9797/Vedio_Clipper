"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
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
  const [transcriptBody, setTranscriptBody] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptFetchError, setTranscriptFetchError] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setTranscriptBody(null);
    setTranscriptFetchError(null);
    setTranscriptLoading(true);
    try {
      const res = await apiFetch(
        `/api/projects/${id}/transcript?jobId=${encodeURIComponent(jobId)}`
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
        setTranscriptFetchError(msg);
        return;
      }
      try {
        setTranscriptBody(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        setTranscriptBody(raw);
      }
    } catch (e) {
      setTranscriptFetchError(
        e instanceof Error ? e.message : "Could not load transcript"
      );
    } finally {
      setTranscriptLoading(false);
    }
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
        return;
      }
      setToast(`Transcription started for job ${body.jobId ?? jobId}.`);
      await load();
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message : "Worker request failed",
      });
    } finally {
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
            <p className="text-sm font-medium text-foreground">Transcription (US-05)</p>
            <p className="text-xs text-zinc-500">
              Runs on the server: FFmpeg (16 kHz mono WAV) → Deepgram. After you upload a
              file/link, use <span className="text-zinc-400">Run</span> in the jobs table for
              that specific row. Watch the <strong className="text-zinc-400">terminal</strong>{" "}
              where <code className="rounded bg-white/5 px-1">npm run dev</code> is running
              for step logs (<code className="rounded bg-white/5 px-1">[transcription:US-05]</code>
              ). When status is <span className="text-emerald-400/90">Transcript complete</span>
              , open the transcript from the table below.
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
                      {j.status === "transcript_complete" && (
                        <Button
                          type="button"
                          variant="link"
                          className="mt-1.5 h-auto p-0 text-xs text-cyan-400"
                          onClick={() => void openTranscriptViewer(j.id)}
                        >
                          <FileJson className="mr-1 h-3.5 w-3.5" />
                          View transcript JSON
                        </Button>
                      )}
                    </td>
                    <td className="p-3.5 pr-4 align-top text-xs text-zinc-500">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 pr-4 align-top">
                      {j.status === "transcript_complete" ? (
                        <Button type="button" variant="outline" size="sm" disabled>
                          Completed
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={runningJobId !== null || j.status === "processing"}
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
            setTranscriptBody(null);
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
          {transcriptBody && !transcriptLoading && (
            <pre className="max-h-[min(60vh,560px)] overflow-auto rounded-lg border border-white/10 bg-zinc-950/80 p-3 text-left text-xs leading-relaxed text-zinc-300">
              {transcriptBody}
            </pre>
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
