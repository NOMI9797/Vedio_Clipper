"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAccessToken } from "@/lib/auth/client-tokens";
import { Loader2 } from "lucide-react";

type Props = { children: React.ReactNode };

export function RequireAuth({ children }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      if (typeof window !== "undefined") {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(
          `/login?next=${encodeURIComponent(next || "/projects")}`
        );
      } else {
        router.replace("/login?next=%2Fprojects");
      }
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" aria-hidden />
        <span>Preparing your workspace…</span>
      </div>
    );
  }
  return <>{children}</>;
}
