import { useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { guessVibe } from "~/lib/vibe";
import type { TMDBSearchResult } from "~/lib/types";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";

interface AddToWatchlistDialogProps {
  item: TMDBSearchResult | null;
  genreMap: Record<number, string>;
  onClose: () => void;
}

export function AddToWatchlistDialog({
  item,
  genreMap,
  onClose,
}: AddToWatchlistDialogProps) {
  const fetcher = useFetcher();
  const [vibe, setVibe] = useState<"casual" | "engaged" | null>(null);
  const [status, setStatus] = useState<"to_watch" | "watching">("to_watch");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (item) {
      const genreNames = item.genreIds
        .map((id) => genreMap[id])
        .filter(Boolean);
      setVibe(guessVibe(genreNames));
      setStatus("to_watch");
      setNote("");
    }
  }, [item]);

  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).success) {
      const added = (fetcher.data as any).item;
      toast.success(`Added "${added.title}" to your watchlist`);
      onClose();
    }
    if (fetcher.data && (fetcher.data as any).error) {
      toast.error((fetcher.data as any).error);
      onClose();
    }
  }, [fetcher.data]);

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border/50 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Add to watchlist
          </DialogTitle>
        </DialogHeader>
        {item && (
          <fetcher.Form method="post" action="/api/watchlist/add" className="space-y-5">
            <input type="hidden" name="tmdbId" value={item.id} />
            <input type="hidden" name="mediaType" value={item.mediaType} />
            <input type="hidden" name="title" value={item.title} />
            <input type="hidden" name="posterPath" value={item.posterPath || ""} />
            <input type="hidden" name="backdropPath" value={item.backdropPath || ""} />
            <input type="hidden" name="overview" value={item.overview} />
            <input type="hidden" name="releaseDate" value={item.releaseDate} />
            <input type="hidden" name="voteAverage" value={item.voteAverage} />
            <input
              type="hidden"
              name="genres"
              value={JSON.stringify(
                item.genreIds.map((id) => genreMap[id]).filter(Boolean)
              )}
            />

            <div className="flex gap-4">
              {item.posterPath && (
                <img
                  src={getTMDBImageUrl(item.posterPath, "w154")!}
                  alt={item.title}
                  className="h-28 w-[74px] rounded-lg object-cover shadow-md"
                />
              )}
              <div>
                <h3 className="font-display font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.mediaType === "movie" ? "Movie" : "TV Show"}{" "}
                  {item.releaseDate &&
                    `(${item.releaseDate.split("-")[0]})`}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vibe
              </label>
              <div className="flex gap-2">
                {(["casual", "engaged"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVibe(vibe === v ? null : v)}
                    className={`chip ${vibe === v ? "chip-active" : "chip-inactive"}`}
                  >
                    {v === "casual" ? "Casual" : "Engaged"}
                  </button>
                ))}
              </div>
              <input type="hidden" name="vibe" value={vibe || ""} />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </label>
              <div className="flex gap-2">
                {([
                  { value: "to_watch", label: "To Watch" },
                  { value: "watching", label: "Watching" },
                ] as const).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`chip ${status === s.value ? "chip-active" : "chip-inactive"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="status" value={status} />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Note{" "}
                <span className="normal-case text-muted-foreground/50">
                  (optional)
                </span>
              </label>
              <Input
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Sarah recommended this"
                className="rounded-xl border-border/50 bg-background/50"
              />
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={fetcher.state !== "idle"}
                className="w-full rounded-xl"
              >
                {fetcher.state !== "idle" ? "Adding..." : "Add to watchlist"}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
