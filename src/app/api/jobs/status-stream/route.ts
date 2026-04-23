import { requireBearer } from "@/lib/auth/bearer";
import { onClipPreviewEvent } from "@/lib/jobs/clip-preview-events";
import { onJobStatusUpdate } from "@/lib/jobs/status-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send("ready", { ok: true, ts: new Date().toISOString() });

      const unsubscribe = onJobStatusUpdate((update) => {
        if (update.userId !== auth.user.sub) {
          return;
        }
        send("job:status_update", update);
      });

      const unsubscribeClip = onClipPreviewEvent((update) => {
        if (update.userId !== auth.user.sub) {
          return;
        }
        send("clip:preview_ready", update);
      });

      const heartbeat = setInterval(() => {
        send("ping", { ts: new Date().toISOString() });
      }, 15000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        unsubscribeClip();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
