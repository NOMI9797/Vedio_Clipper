/**
 * Public clip list shape (GET /api/jobs/{jobId}/clips).
 */
export type ClipEntry = {
  clipId: string;
  start: number;
  end: number;
  score: number | null;
  transcript_excerpt: string;
  suggested_title: string;
  selected?: boolean;
  edited?: boolean;
  previewReady?: boolean;
  manual?: boolean;
};
