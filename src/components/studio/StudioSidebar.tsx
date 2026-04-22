"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { clearAuthTokens } from "@/lib/auth/client-tokens";
import { apiFetch } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Calendar,
  CreditCard,
  HelpCircle,
  Home,
  ImageIcon,
  LayoutTemplate,
  LineChart,
  LogOut,
  UserPlus,
  Users,
} from "lucide-react";

function navLinkClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
    active
      ? "bg-white/10 text-foreground"
      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
  );
}

function disabledRow(label: string, icon: React.ReactNode) {
  return (
    <span
      className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600"
      title="Coming soon"
    >
      {icon}
      {label}
    </span>
  );
}

function NavBadge() {
  return (
    <span className="ml-auto rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-violet-200">
      New
    </span>
  );
}

export function StudioSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  const isStudioHome = pathname === "/projects" || pathname === "/projects/";
  const inProject = pathname?.startsWith("/projects/") ?? false;
  const homeActive = isStudioHome || inProject;

  const loadUser = useCallback(async () => {
    const res = await apiFetch("/api/protected/test");
    if (!res.ok) {
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { email?: string };
    if (body.email) {
      setEmail(body.email);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  function signOut() {
    clearAuthTokens();
    router.replace("/");
  }

  const display = email
    ? email.length > 20
      ? `${email.slice(0, 10)}…${email.slice(-4)}`
      : email
    : "Account";

  const initial = (email && email[0] ? email[0] : "U").toUpperCase();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#0a0a0b]">
      <div className="flex items-center justify-between gap-2 px-3 py-4">
        <Link
          href="/projects"
          className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm text-white">
            V
          </span>
          <span className="truncate text-sm">VedioClipper</span>
        </Link>
        <Badge variant="muted" className="shrink-0 text-[10px]">
          Beta
        </Badge>
      </div>

      <div className="px-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-2.5 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/80 text-sm font-medium text-white">
            {initial}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={email ?? undefined}>
            {display}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full justify-center rounded-lg border-dashed"
          onClick={() => {
            /* placeholder */
          }}
        >
          <UserPlus className="h-4 w-4" />
          Invite members
        </Button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Create
        </p>
        <Link href="/projects" className={navLinkClass(homeActive)}>
          <Home className="h-4 w-4 shrink-0" />
          Home
        </Link>
        {disabledRow("Brand template", <LayoutTemplate className="h-4 w-4" />)}
        {disabledRow("Asset library", <ImageIcon className="h-4 w-4" />)}

        <p className="mt-3 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Post
        </p>
        <div
          className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600"
          title="Coming soon"
        >
          <Calendar className="h-4 w-4 shrink-0" />
          Calendar
          <NavBadge />
        </div>
        <div
          className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600"
          title="Coming soon"
        >
          <LineChart className="h-4 w-4 shrink-0" />
          Analytics
          <NavBadge />
        </div>
        {disabledRow("Social accounts", <Users className="h-4 w-4" />)}
      </div>

      <Separator className="bg-white/5" />
      <div className="space-y-0.5 p-2">
        {disabledRow("Subscription", <CreditCard className="h-4 w-4" />)}
        {disabledRow("Learning center", <BookOpen className="h-4 w-4" />)}
        <a
          href="mailto:support@example.com"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
          Help center
        </a>
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start gap-2.5 rounded-lg px-2.5 py-2 text-sm font-normal text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </aside>
  );
}
