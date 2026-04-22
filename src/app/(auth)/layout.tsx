import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <div className="mx-auto max-w-md px-4 pb-16 pt-12">
        <Link
          href="/"
          className="text-sm text-neutral-500 transition hover:text-neutral-800"
        >
          ← Home
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">VedioClipper</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Milestone 1: auth foundation.
        </p>
        <div className="mt-10">{children}</div>
      </div>
    </div>
  );
}
