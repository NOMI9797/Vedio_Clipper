"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject } from "@/hooks/use-project";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ArrowLeft, Film, Link2, Loader2, Upload, Video } from "lucide-react";

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

function getStatusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Downloading...";
    case "transcript_complete":
      return "Transcribing...";
    case "analysis_complete":
      return "Generating clips...";
    case "clips_ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return "Processing...";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "clips_ready":
      return "bg-emerald-500";
    case "failed":
      return "bg-rose-500";
    case "queued":
      return "bg-zinc-500";
    default:
      return "bg-cyan-500";
  }
}

function VideoCard({
  job,
  projectId,
  onPrefetch,
}: {
  job: JobRow;
  projectId: string;
  onPrefetch: (jobId: string) => void;
}) {
  const router = useRouter();
  const isReady = job.status === "clips_ready";
  const isFailed = job.status === "failed";
  const isProcessing = !isReady && !isFailed;

  // Extract video ID from YouTube URL for thumbnail
  const youtubeId = job.sourceUrl
    ? job.sourceUrl.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1]
    : null;
  const thumbUrl = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
    : null;

  const handleClick = () => {
    if (isReady) {
      onPrefetch(job.id);
      router.push(`/projects/${projectId}/clips?jobId=${encodeURIComponent(job.id)}`);
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition-all duration-200",
        isReady && "cursor-pointer hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10",
        isFailed && "opacity-60"
      )}
      onClick={handleClick}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900">
            <Video className="h-12 w-12 text-zinc-700" />
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="mt-3 text-sm font-medium text-white">{getStatusLabel(job.status)}</p>
            <div className="mt-3 h-1.5 w-32 overflow-hidden rounded-full bg-zinc-700">
              <div
                className={cn("h-full transition-all duration-500", getStatusColor(job.status))}
                style={{ width: `${Math.max(10, job.progress)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">{job.progress}%</p>
          </div>
        )}

        {/* Failed overlay */}
        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <p className="text-sm font-medium text-rose-400">Processing failed</p>
            <p className="mt-1 max-w-[80%] text-center text-xs text-zinc-400">
              {job.error ? job.error.slice(0, 60) : "Something went wrong"}
            </p>
          </div>
        )}

        {/* Ready badge */}
        {isReady && (
          <div className="absolute right-2 top-2 rounded-lg bg-emerald-500/90 px-2 py-1 text-[11px] font-bold text-black backdrop-blur-sm">
            READY
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="border-t border-zinc-800/50 p-3">
        <p className="truncate text-sm font-medium text-zinc-200">
          {job.sourceUrl ? "YouTube Video" : job.objectKey ? "Uploaded Video" : "Video"}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {job.sourceUrl || job.objectKey || "—"}
        </p>
        <p className="mt-1.5 text-[10px] text-zinc-600">
          {new Date(job.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

function ProjectDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { project, jobs, isLoading, isError, error, prefetchJobClips } = useProject(id);

  const [importTab, setImportTab] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle ?ingest= param
  useEffect(() => {
    const ingestParam = searchParams.get("ingest");
    if (ingestParam) {
      setUrl(ingestParam);
      setImportTab("url");
    }
  }, [searchParams]);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function submitFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !id) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(`/api/projects/${id}/upload`, {
      method: "POST",
      body: fd,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; jobId?: string };
    setBusy(false);
    if (!res.ok) {
      setToast(body.error ?? "Upload failed");
      return;
    }
    setFile(null);
    setToast(`Upload queued! Processing...`);
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !url.trim()) return;
    setBusy(true);
    const res = await apiFetch(`/api/projects/${id}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; jobId?: string };
    setBusy(false);
    if (!res.ok) {
      setToast(body.error ?? "Could not queue URL");
      return;
    }
    setUrl("");
    setToast(`Link queued! Processing...`);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-zinc-500">Loading project...</p>
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-rose-400">{error ?? "Project not found"}</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-black text-zinc-200">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/60 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">{project.name}</h1>
              <p className="text-xs text-zinc-500">
                {jobs.length} video{jobs.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Upload section */}
        <div className="mb-8 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 sm:p-5">
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="video/mp4,video/quicktime,video/webm,.mkv,video/x-matroska"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <Tabs value={importTab} onValueChange={(v) => setImportTab(v as "file" | "url")}>
            <TabsList className="grid w-full max-w-sm grid-cols-2 bg-zinc-800/50">
              <TabsTrigger value="file" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <Link2 className="h-4 w-4" />
                YouTube Link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-4">
              <form onSubmit={submitFile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-1 items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-3 text-left transition hover:border-zinc-600"
                >
                  <Film className="h-5 w-5 text-zinc-500" />
                  <span className="truncate text-sm text-zinc-300">
                    {file ? file.name : "Choose video file..."}
                  </span>
                </button>
                <Button type="submit" disabled={busy || !file} className="h-11 px-6">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload & Process"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="url" className="mt-4">
              <form onSubmit={submitUrl} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste YouTube link..."
                    className="h-11 border-zinc-700 bg-zinc-950/60 pl-10"
                  />
                </div>
                <Button type="submit" disabled={busy || !url.trim()} className="h-11 px-6">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Clips"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* Videos grid */}
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 py-20">
            <Video className="h-12 w-12 text-zinc-700" />
            <p className="text-sm text-zinc-500">No videos yet. Upload or paste a link above.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <VideoCard
                key={job.id}
                job={job}
                projectId={id}
                onPrefetch={prefetchJobClips}
              />
            ))}
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-20 z-50 rounded-lg border border-emerald-500/30 bg-zinc-900/95 px-4 py-2 text-sm text-emerald-300 shadow-lg backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <ProjectDetailContent />
    </Suspense>
  );
}
