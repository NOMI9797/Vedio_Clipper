import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type ProjectStatus = "pending" | "processing" | "ready" | "failed";

function projectVariant(
  s: ProjectStatus
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  switch (s) {
    case "ready":
      return "success";
    case "failed":
      return "destructive";
    case "processing":
      return "default";
    default:
      return "warning";
  }
}

function jobVariant(
  s: string
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  switch (s) {
    case "clips_ready":
    case "transcript_complete":
      return "success";
    case "analysis_complete":
      return "default";
    case "failed":
      return "destructive";
    case "processing":
    case "queued":
      return "default";
    default:
      return "muted";
  }
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant={projectVariant(status)} className="capitalize">
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={jobVariant(status)} className="capitalize">
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
