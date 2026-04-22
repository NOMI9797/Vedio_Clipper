import { AuthPanel } from "@/components/home/AuthPanel";

export default function Home() {
  return (
    <main className="min-h-dvh bg-white px-8 py-10 text-neutral-900">
      <h1 className="text-2xl font-semibold">VedioClipper</h1>
      <p className="mt-2 text-sm text-neutral-500">Milestone 1: auth foundation.</p>
      <AuthPanel />
    </main>
  );
}
