import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/15 text-violet-200 border-violet-500/20",
        secondary:
          "border-transparent bg-white/5 text-muted-foreground border-white/10",
        outline: "border-white/20 text-foreground",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-200",
        destructive: "border-rose-500/30 bg-rose-500/10 text-rose-200",
        muted: "border-white/10 bg-zinc-800/80 text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
