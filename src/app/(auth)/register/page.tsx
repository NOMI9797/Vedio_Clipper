"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { AuthFormFields } from "@/components/auth/AuthFormFields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuthTokens } from "@/lib/auth/client-tokens";

const STUDIO_PATH = "/projects";

function safeReturnPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return STUDIO_PATH;
  }
  return next;
}

export default function RegisterPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    setIsSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    if (data.accessToken && data.refreshToken) {
      setAuthTokens(data.accessToken, data.refreshToken);
    }
    router.push(safeReturnPath(search.get("next")));
    router.refresh();
  }

  return (
    <AuthFormFields
      title="Create account"
      error={error}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      submitLabel="Create account"
      footer={
        <span>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-cyan-300/90 underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </span>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="email" className="text-zinc-300">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-zinc-300">
          Password
        </Label>
        <p className="text-xs text-muted-foreground">At least 8 characters</p>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
    </AuthFormFields>
  );
}
