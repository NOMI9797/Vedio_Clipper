"use client";

import type { ReactNode } from "react";

import { RequireAuth } from "@/components/app/RequireAuth";
import { StudioSidebar } from "@/components/studio/StudioSidebar";

type Props = { children: ReactNode };

export function StudioLayoutClient({ children }: Props) {
  return (
    <RequireAuth>
      <div className="flex h-dvh w-full min-h-0 overflow-hidden bg-zinc-950 text-foreground">
        <StudioSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-10 sm:px-8 lg:px-12">
              {children}
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
