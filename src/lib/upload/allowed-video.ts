import path from "node:path";

/**
 * US-03: MP4, MOV, MKV, WebM — by declared MIME, plus
 * `application/octet-stream` + allowed extension (common for some upload clients).
 */
const DIRECT_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matrosska",
  "video/x-matroska",
  "video/mkv",
]);

const EXT_FALLBACK: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export function resolveVideoContentType(
  declaredMime: string,
  fileName: string
): { ok: true; contentType: string } | { ok: false } {
  const m = declaredMime.trim().toLowerCase();
  if (DIRECT_MIMES.has(m)) {
    return { ok: true, contentType: m };
  }
  if (m === "application/octet-stream") {
    const ext = path.extname(fileName).toLowerCase();
    const c = EXT_FALLBACK[ext];
    if (c) {
      return { ok: true, contentType: c };
    }
  }
  return { ok: false };
}
