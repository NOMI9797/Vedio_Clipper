"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { ProjectStatusBadge } from "@/components/projects/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AudioWaveform,
  Cloud,
  Clapperboard,
  Crop,
  Film,
  HelpCircle,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Scissors,
  Sparkles,
  Subtitles,
  Upload,
} from "lucide-react";

type ProjectRow = {
  id: string;
  name: string;
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
};

const FEATURES: { label: string; icon: React.ReactNode }[] = [
  { label: "Long to shorts", icon: <Sparkles className="h-4 w-4" /> },
  { label: "AI Captions", icon: <Subtitles className="h-4 w-4" /> },
  { label: "Video editor", icon: <Scissors className="h-4 w-4" /> },
  { label: "Enhance speech", icon: <AudioWaveform className="h-4 w-4" /> },
  { label: "AI Reframe", icon: <Crop className="h-4 w-4" /> },
  { label: "AI B-Roll", icon: <Film className="h-4 w-4" /> },
  { label: "AI hook", icon: <MessageCircle className="h-4 w-4" /> },
];

function isRecent(createdAt: string, days: number) {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) {
    return false;
  }
  return Date.now() - t < days * 24 * 60 * 60 * 1000;
}

function tabButton(active: boolean) {
  return cn(
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-white/10 text-foreground"
      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ProjectRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "saved">("all");
  const [autoSave, setAutoSave] = useState(true);
  const [autoImport, setAutoImport] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await apiFetch("/api/projects?limit=50&offset=0");
    const body = (await res.json().catch(() => ({}))) as {
      data?: ProjectRow[];
      error?: string;
    };
    if (!res.ok) {
      setLoadError(body.error ?? "Could not load projects");
      setItems([]);
      return;
    }
    setItems(body.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!items) {
      return null;
    }
    if (tab === "saved") {
      return items.filter(() => false);
    }
    return items;
  }, [items, tab]);

  const createAndGo = useCallback(
    async (name: string) => {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Could not create project");
      }
      if (!body.id) {
        throw new Error("No project id");
      }
      return body.id;
    },
    []
  );

  async function onGetClips(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);
    const url = linkInput.trim();
    if (!url) {
      setLinkError("Add a public video link first.");
      return;
    }
    const raw = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      setLinkError("That doesn’t look like a valid link.");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setLinkError("That doesn’t look like a valid link.");
      return;
    }
    setLinkBusy(true);
    try {
      const name = `Clips ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
      const id = await createAndGo(name);
      const q = new URLSearchParams();
      q.set("ingest", raw);
      router.push(`/projects/${id}?${q.toString()}`);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setLinkBusy(false);
    }
  }

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setNewError(null);
    const n = newName.trim();
    if (!n) {
      setNewError("Enter a name.");
      return;
    }
    setNewBusy(true);
    try {
      const id = await createAndGo(n);
      setNewName("");
      setNewOpen(false);
      router.push(`/projects/${id}`);
    } catch (err) {
      setNewError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setNewBusy(false);
    }
  }

  const listCount = items?.length ?? 0;

  return (
    <div className="space-y-14 lg:space-y-16">
      <div className="space-y-8 text-center lg:space-y-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">VedioClipper</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn long videos into short clips, captions, and edits.
        </p>
        <form
          onSubmit={onGetClips}
          className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-zinc-900/50 p-5 sm:p-6"
        >
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
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
                title="Create a project, then open it to upload files from your device"
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
              disabled={linkBusy}
            >
              {linkBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                "Get clips in 1 click"
              )}
            </Button>
          </div>
          {linkError && <p className="mt-2 text-left text-sm text-rose-400">{linkError}</p>}
        </form>

        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-2.5 sm:gap-3.5">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex h-9 items-center gap-1.5 rounded-full border border-white/5 bg-zinc-900/40 px-3 text-xs text-muted-foreground"
              title="Coming in a later release"
            >
              <span className="text-foreground/90">{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              className={tabButton(tab === "all")}
              onClick={() => setTab("all")}
            >
              All projects ({listCount})
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={tabButton(tab === "saved")}
              onClick={() => setTab("saved")}
            >
              Saved projects (0)
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setNewOpen(true)}>
              <Clapperboard className="h-4 w-4" />
              New project
            </Button>
          </div>
          <div className="flex flex-col gap-2.5 lg:items-end">
            <p className="text-xs text-muted-foreground">0 GB / 100 GB</p>
            <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2">
                <span>Auto-save</span>
                <Switch checked={autoSave} onCheckedChange={setAutoSave} />
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <span>Auto-import</span>
                <BadgePill>β</BadgePill>
                <Switch checked={autoImport} onCheckedChange={setAutoImport} />
              </label>
            </div>
          </div>
        </div>

        {loadError && (
          <p className="text-sm text-rose-400" role="alert">
            {loadError}
          </p>
        )}

        {items === null && !loadError && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-busy>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </p>
        )}

        {visible && visible.length === 0 && tab === "all" && (
          <p className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-muted-foreground">
            No projects yet. Paste a link above or start a new project.
          </p>
        )}

        {tab === "saved" && (
          <p className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-muted-foreground">
            No saved projects. Star a project when that appears in a future update.
          </p>
        )}

        {visible && visible.length > 0 && (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => {
              const recent = isRecent(p.createdAt, 7);
              return (
                <li key={p.id} className="group">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 shadow-sm shadow-black/30">
                    <Link href={`/projects/${p.id}`} className="block">
                      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-violet-900/30 via-zinc-900 to-zinc-950">
                        {recent && (
                          <span className="absolute left-2 top-2 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                            New
                          </span>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-40 transition group-hover:opacity-60">
                          <Clapperboard className="h-10 w-10 text-white" />
                        </div>
                        <p className="absolute bottom-2 left-2 right-2 truncate text-xs text-zinc-300/90">
                          Created {new Date(p.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-start gap-2 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/projects/${p.id}`}
                            className="line-clamp-1 flex-1 text-sm font-medium text-foreground hover:underline"
                          >
                            {p.name}
                          </Link>
                          <ProjectMenu projectId={p.id} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Workspace</span>
                          <ProjectStatusBadge status={p.status} />
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <a
        href="mailto:support@example.com"
        className="fixed bottom-6 right-5 z-40 flex h-10 items-center gap-2 rounded-full border border-white/10 bg-zinc-900/90 px-4 text-sm text-muted-foreground shadow-lg backdrop-blur hover:border-white/20 hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4" />
        Questions?
      </a>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreateProject} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
                placeholder="e.g. Q1 interview series"
                className="h-11"
                autoFocus
              />
            </div>
            {newError && <p className="text-sm text-rose-400">{newError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={newBusy} variant="glow">
                {newBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BadgePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-200">
      {children}
    </span>
  );
}

function ProjectMenu({ projectId }: { projectId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          aria-label="Project options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem asChild>
          <Link href={`/projects/${projectId}`}>Open</Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Duplicate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
