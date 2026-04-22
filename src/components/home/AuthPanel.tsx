"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
} from "@/lib/auth/client-tokens";

type PanelState = { status: "loading" } | { status: "guest" } | { status: "authed" };

function readSession(): "guest" | "authed" {
  if (typeof window === "undefined") {
    return "guest";
  }
  return getAccessToken() && getRefreshToken() ? "authed" : "guest";
}

export function AuthPanel() {
  const [panel, setPanel] = useState<PanelState>({ status: "loading" });
  const [apiCheck, setApiCheck] = useState<{
    loading: boolean;
    ok: boolean;
    text: string;
  } | null>(null);

  const sync = useCallback(() => {
    setPanel({ status: readSession() });
  }, []);

  useEffect(() => {
    sync();
    if (typeof window === "undefined") {
      return;
    }
    const onChange = () => sync();
    window.addEventListener("vedioclipper:auth", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener("vedioclipper:auth", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [sync]);

  const signOut = () => {
    clearAuthTokens();
    setApiCheck(null);
  };

  const verifyProtected = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setApiCheck({ loading: true, ok: false, text: "" });
    const res = await fetch("/api/protected/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setApiCheck({ loading: false, ok: true, text: JSON.stringify(body) });
    } else {
      setApiCheck({
        loading: false,
        ok: false,
        text: (body as { error?: string }).error ?? res.statusText,
      });
    }
  };

  if (panel.status === "loading") {
    return <p className="mt-8 text-sm text-neutral-500">…</p>;
  }

  if (panel.status === "guest") {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
        <Link
          href="/login"
          className="font-medium text-neutral-900 underline-offset-4 hover:underline"
        >
          Log in
        </Link>
        <span className="text-neutral-300">|</span>
        <Link
          href="/register"
          className="font-medium text-neutral-900 underline-offset-4 hover:underline"
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4 text-sm text-neutral-700">
      <p>
        You are signed in.{" "}
        <span className="text-neutral-500">(access token in local storage)</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={signOut}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-900 shadow-sm transition hover:bg-neutral-50"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={verifyProtected}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-white shadow-sm transition hover:bg-neutral-800"
        >
          Test protected API
        </button>
      </div>
      {apiCheck && !apiCheck.loading && (
        <p
          className={
            apiCheck.ok
              ? "rounded-md border border-emerald-200 bg-emerald-50 p-2 font-mono text-xs text-emerald-900"
              : "rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900"
          }
        >
          {apiCheck.text}
        </p>
      )}
    </div>
  );
}
