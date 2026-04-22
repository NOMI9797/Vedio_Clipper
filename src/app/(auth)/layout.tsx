import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { MarketingBackground } from "@/components/brand/MarketingBackground";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh text-foreground">
      <MarketingBackground />
      <div className="mx-auto max-w-md px-4 py-10 sm:px-0 sm:pt-20">
        <Link
          href="/"
          className="text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Back
        </Link>
        <div className="mb-8 mt-6">
          <h1 className="text-2xl font-semibold tracking-tight text-gradient-hero sm:text-3xl">
            VedioClipper
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Studio-grade video intelligence — start with your account.
          </p>
        </div>
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading form…</p>
          }
        >
          {children}
        </Suspense>
      </div>
    </div>
  );
}
