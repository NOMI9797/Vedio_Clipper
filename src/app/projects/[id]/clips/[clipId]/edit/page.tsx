import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { EditClipView } from "./edit-view";

type PageProps = {
  params: { id: string; clipId: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export default function EditClipPage({ params, searchParams }: PageProps) {
  const jobIdRaw = searchParams.jobId;
  const jobId = typeof jobIdRaw === "string" && jobIdRaw.length > 0 ? jobIdRaw : null;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-black" aria-busy>
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading clip editor…
          </p>
        </div>
      }
    >
      <EditClipView projectId={params.id} clipId={params.clipId} jobId={jobId} />
    </Suspense>
  );
}
