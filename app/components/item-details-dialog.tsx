import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import type { TMDBSearchResult, TMDBTrailer, WatchProvider } from "~/lib/types";
import { TrailerButton } from "~/components/trailer-button";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "~/components/ui/dialog";
import { Star, Plus, Loader2, ExternalLink } from "lucide-react";

interface ItemDetailsDialogProps {
  item: TMDBSearchResult | null;
  genreMap: Record<number, string>;
  watchlistItemId?: number;
  onClose: () => void;
  onAddToWatchlist: (item: TMDBSearchResult) => void;
}

export function ItemDetailsDialog({
  item,
  genreMap,
  watchlistItemId,
  onClose,
  onAddToWatchlist,
}: ItemDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [trailer, setTrailer] = useState<TMDBTrailer | null>(null);

  useEffect(() => {
    if (!item) {
      setProviders([]);
      setTrailer(null);
      return;
    }

    setLoading(true);
    fetch(`/api/tmdb/details?tmdbId=${item.id}&mediaType=${item.mediaType}`)
      .then((res) => res.json() as Promise<{ providers?: WatchProvider[]; trailer?: TMDBTrailer | null }>)
      .then((data) => {
        setProviders(data.providers || []);
        setTrailer(data.trailer || null);
      })
      .catch(() => {
        setProviders([]);
        setTrailer(null);
      })
      .finally(() => setLoading(false));
  }, [item?.id, item?.mediaType]);

  const flatrate = providers.filter((p) => p.providerType === "flatrate");
  const genres = item?.genreIds.map((id) => genreMap[id]).filter(Boolean) || [];

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto border-border/50 bg-card p-0 sm:max-w-lg"
        showCloseButton
      >
        {/* Hidden description for accessibility */}
        <DialogDescription className="sr-only">
          Details for {item?.title}
        </DialogDescription>

        {item && (
          <>
            {/* Backdrop */}
            {item.backdropPath ? (
              <div className="relative h-48 w-full overflow-hidden rounded-t-lg sm:h-56">
                <img
                  src={getTMDBImageUrl(item.backdropPath, "w780")!}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
              </div>
            ) : (
              <div className="h-6" />
            )}

            <div className="space-y-5 px-6 pb-6">
              {/* Header */}
              <div className="flex gap-4">
                {item.posterPath && (
                  <img
                    src={getTMDBImageUrl(item.posterPath, "w154")!}
                    alt={item.title}
                    className={`w-20 rounded-lg object-cover shadow-xl ring-1 ring-white/5 ${
                      item.backdropPath ? "-mt-16 relative" : ""
                    }`}
                  />
                )}
                <div className={`flex-1 space-y-1.5 ${item.backdropPath ? "-mt-2" : ""}`}>
                  <h2 className="font-display text-xl font-bold tracking-tight">
                    {item.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase tracking-wider"
                    >
                      {item.mediaType === "movie" ? "Film" : "Series"}
                    </Badge>
                    {item.releaseDate && (
                      <span>{item.releaseDate.split("-")[0]}</span>
                    )}
                    {item.voteAverage > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-primary/80 text-primary/80" />
                        {item.voteAverage.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {genres.map((genre) => (
                        <Badge
                          key={genre}
                          variant="outline"
                          className="border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Overview */}
              {item.overview && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.overview}
                </p>
              )}

              {/* Trailer */}
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {trailer && <TrailerButton trailer={trailer} />}

                  {/* Streaming providers */}
                  {flatrate.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Stream on
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {flatrate.map((p) => (
                          <div
                            key={p.providerId}
                            className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/30 px-3 py-2"
                          >
                            {p.logoPath && (
                              <img
                                src={getTMDBImageUrl(p.logoPath, "w92")!}
                                alt=""
                                className="h-6 w-6 rounded-md"
                              />
                            )}
                            <span className="text-xs font-medium">
                              {p.providerName}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Action */}
              <div className="pt-1">
                {watchlistItemId ? (
                  <Button asChild className="w-full gap-2 rounded-xl">
                    <Link to={`/item/${watchlistItemId}`} onClick={onClose}>
                      <ExternalLink className="h-4 w-4" />
                      View in watchlist
                    </Link>
                  </Button>
                ) : (
                  <Button
                    onClick={() => onAddToWatchlist(item)}
                    className="w-full gap-2 rounded-xl"
                  >
                    <Plus className="h-4 w-4" />
                    Add to watchlist
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
