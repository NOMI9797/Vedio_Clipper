"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/lib/auth/client-tokens";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "text-base font-semibold tracking-tight transition",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const [authed, setAuthed] = useState(false);
  const syncAuth = useCallback(() => {
    setAuthed(!!getAccessToken());
  }, []);

  useEffect(() => {
    syncAuth();
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("vedioclipper:auth", syncAuth);
    window.addEventListener("focus", syncAuth);
    return () => {
      window.removeEventListener("vedioclipper:auth", syncAuth);
      window.removeEventListener("focus", syncAuth);
    };
  }, [syncAuth]);

  return (
    <header className="relative z-20 border-b border-white/5 bg-background/40 backdrop-blur-md">
      <div className="relative h-14 w-full px-4 sm:h-16 sm:px-8 lg:px-10">
        <div className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 sm:left-8 lg:left-10">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-base font-semibold tracking-tight"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/90 to-cyan-500/80 text-white shadow-lg shadow-violet-500/15">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-foreground">VedioClipper</span>
          </Link>
        </div>

        <nav
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-12 md:flex"
          aria-label="Main"
        >
          <NavLink href="/">Home</NavLink>
          <NavLink href="/projects">Projects</NavLink>
        </nav>

        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2 sm:right-8 sm:gap-3 lg:right-10">
          {authed ? (
            <Button
              asChild
              size="sm"
              className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-black hover:bg-white/90"
            >
              <Link href="/projects">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Link href="/login">Log in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-black hover:bg-white/90"
              >
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-8 border-t border-white/5 py-2.5 md:hidden">
        <NavLink href="/">Home</NavLink>
        <NavLink href="/projects">Projects</NavLink>
      </div>
    </header>
  );
}
