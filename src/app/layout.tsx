import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

import "./globals.css";

export const metadata: Metadata = {
  title: "VedioClipper — AI video workspace",
  description:
    "Ingest, transcribe, and clip video with a polished AI-powered workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(GeistSans.variable, GeistMono.variable, "dark")}
      suppressHydrationWarning
    >
      <body
        className={cn(GeistSans.className, "min-h-dvh antialiased selection:bg-violet-500/30")}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
