import { useState } from "react";
import { useFetcher } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { STREAMING_SERVICES } from "~/lib/streaming-services";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { cn } from "~/lib/utils";

interface StreamingServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialServiceIds: number[];
}

export function StreamingServicesDialog({
  open,
  onOpenChange,
  initialServiceIds,
}: StreamingServicesDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialServiceIds)
  );
  const fetcher = useFetcher();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSave() {
    fetcher.submit(
      { providerIds: JSON.stringify(Array.from(selected)) },
      { method: "post", action: "/api/settings" }
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">My streaming services</DialogTitle>
          <DialogDescription>
            Select the services you subscribe to. Your services will be highlighted on each title.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 py-2">
          {STREAMING_SERVICES.map((service) => {
            const isSelected = selected.has(service.id);
            return (
              <button
                key={service.id}
                onClick={() => toggle(service.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                  isSelected
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20"
                    : "border-border/40 bg-card/30 hover:border-border/60 hover:bg-card/50"
                )}
              >
                <img
                  src={getTMDBImageUrl(service.logoPath, "w92")!}
                  alt=""
                  className={cn(
                    "h-8 w-8 rounded-lg transition-opacity",
                    isSelected ? "opacity-100" : "opacity-50"
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    isSelected ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {service.name}
                </span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            className="w-full rounded-xl"
            disabled={fetcher.state !== "idle"}
          >
            {fetcher.state !== "idle" ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
