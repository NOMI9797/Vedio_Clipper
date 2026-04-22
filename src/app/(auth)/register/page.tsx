"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthFormFields } from "@/components/auth/AuthFormFields";
import { setAuthTokens } from "@/lib/auth/client-tokens";

export default function RegisterPage() {
  const router = useRouter();
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
    router.push("/");
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
            className="font-medium text-neutral-900 underline-offset-2 hover:underline"
          >
            Log in
          </Link>
        </span>
      }
    >
      <div>
        <label htmlFor="email" className="block text-sm text-neutral-600">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-neutral-600">
          Password
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">At least 8 characters</p>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400"
          required
        />
      </div>
    </AuthFormFields>
  );
}
