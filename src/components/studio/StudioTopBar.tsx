import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Zap } from "lucide-react";

export function StudioTopBar() {
  return (
    <header className="shrink-0 border-b border-white/5 bg-zinc-950/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 lg:px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-rose-500 px-1 text-[10px] font-medium leading-none text-white">
            0
          </span>
        </Button>
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/50 px-2.5 py-1 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-amber-400" aria-hidden />
          <span>—</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="rounded-lg" disabled>
          Add more credits
        </Button>
        <Badge variant="muted" className="hidden sm:inline-flex">
          Free trial
        </Badge>
      </div>
    </header>
  );
}
