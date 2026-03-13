import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { useSwipe } from "~/lib/use-swipe";
import type { TMDBTrailer } from "~/lib/types";
import { TrailerButton } from "~/components/trailer-button";
import { Badge } from "~/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  Star,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";

export interface BrowsableItem {
  item: {
    id: number;
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    releaseDate: string | null;
    voteAverage: number | null;
    genres: string | null;
    status: string;
    vibe: string | null;
    note: string | null;
  };
  providers: Array<{
    logoPath: string | null;
    providerName: string;
    providerId: number | null;
  }>;
}

interface ItemBrowserSheetProps {
  items: BrowsableItem[];
  selectedIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  userServiceIds: number[];
}

export function ItemBrowserSheet({
  items,
  selectedIndex,
  onClose,
  onNavigate,
  userServiceIds,
}: ItemBrowserSheetProps) {
  const [trailer, setTrailer] = useState<TMDBTrailer | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);

  const isOpen = selectedIndex !== null;
  const current = isOpen ? items[selectedIndex] : null;
  const hasPrev = isOpen && selectedIndex > 0;
  const hasNext = isOpen && selectedIndex < items.length - 1;

  const goNext = useCallback(() => {
    if (hasNext && selectedIndex !== null) onNavigate(selectedIndex + 1);
  }, [hasNext, selectedIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (hasPrev && selectedIndex !== null) onNavigate(selectedIndex - 1);
  }, [hasPrev, selectedIndex, onNavigate]);

  // Fetch trailer when item changes
  useEffect(() => {
    if (!current) {
      setTrailer(null);
      return;
    }
    setTrailer(null);
    setTrailerLoading(true);
    fetch(
      `/api/tmdb/details?tmdbId=${current.item.tmdbId}&mediaType=${current.item.mediaType}`
    )
      .then(
        (res) =>
          res.json() as Promise<{ trailer?: TMDBTrailer | null }>
      )
      .then((data) => setTrailer(data.trailer || null))
      .catch(() => setTrailer(null))
      .finally(() => setTrailerLoading(false));
  }, [current?.item.tmdbId, current?.item.mediaType]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is focused on an iframe (trailer)
      if (document.activeElement?.tagName === "IFRAME") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goNext, goPrev]);

  // Swipe navigation
  const swipeRef = useSwipe<HTMLDivElement>({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  });

  const genres = current
    ? (() => {
        try {
          return JSON.parse(current.item.genres || "[]") as string[];
        } catch {
          return [];
        }
      })()
    : [];

  const flatrate = current?.providers || [];
  const preferredProviders =
    userServiceIds.length > 0
      ? flatrate.filter(
          (p) =>
            p.providerId != null && userServiceIds.includes(p.providerId)
        )
      : [];
  const otherProviders =
    userServiceIds.length > 0
      ? flatrate.filter(
          (p) =>
            p.providerId == null || !userServiceIds.includes(p.providerId)
        )
      : flatrate;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[90dvh] max-h-[90dvh] rounded-t-2xl border-border/50 bg-card p-0"
      >
        {/* Accessibility */}
        <SheetTitle className="sr-only">
          {current?.item.title ?? "Item browser"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Browse watchlist items
        </SheetDescription>

        {current && (
          <div
            ref={swipeRef}
            className="flex h-full flex-col overflow-y-auto"
          >
            {/* Close handle */}
            <div className="sticky top-0 z-20 flex justify-center pb-0 pt-3">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Backdrop */}
            {current.item.backdropPath ? (
              <div className="relative -mt-2 h-48 w-full flex-none overflow-hidden sm:h-64">
                <img
                  src={getTMDBImageUrl(current.item.backdropPath, "w780")!}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
              </div>
            ) : (
              <div className="h-4" />
            )}

            <div
              key={current.item.id}
              className="animate-in fade-in duration-200 space-y-5 px-6 pb-8"
            >
              {/* Header: poster + info */}
              <div className="flex gap-4">
                {current.item.posterPath && (
                  <img
                    src={getTMDBImageUrl(current.item.posterPath, "w154")!}
                    alt={current.item.title}
                    className={`w-20 flex-none rounded-lg object-cover shadow-xl ring-1 ring-white/5 ${
                      current.item.backdropPath ? "relative -mt-16" : ""
                    }`}
                  />
                )}
                <div
                  className={`flex-1 space-y-1.5 ${
                    current.item.backdropPath ? "-mt-2" : ""
                  }`}
                >
                  <h2 className="font-display text-xl font-bold tracking-tight">
                    {current.item.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase tracking-wider"
                    >
                      {current.item.mediaType === "movie" ? "Film" : "Series"}
                    </Badge>
                    {current.item.releaseDate && (
                      <span>{current.item.releaseDate.split("-")[0]}</span>
                    )}
                    {current.item.voteAverage != null &&
                      current.item.voteAverage > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-primary/80 text-primary/80" />
                          {current.item.voteAverage.toFixed(1)}
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
              {current.item.overview && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {current.item.overview}
                </p>
              )}

              {/* Trailer */}
              {trailerLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                trailer && <TrailerButton trailer={trailer} />
              )}

              {/* Streaming providers */}
              {flatrate.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Stream on
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...preferredProviders, ...otherProviders].map((p) => (
                      <div
                        key={p.providerId}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                          preferredProviders.includes(p)
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/40 bg-background/30"
                        }`}
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

              {/* View full details link */}
              <Link
                to={`/item/${current.item.id}`}
                onClick={onClose}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View full details
              </Link>
            </div>

            {/* Bottom spacer for navigation bar */}
            <div className="h-16 flex-none" />
          </div>
        )}

        {/* Navigation bar - fixed at bottom of sheet */}
        {isOpen && items.length > 1 && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-border/30 bg-card/95 px-4 py-3 backdrop-blur-sm">
            <button
              onClick={goPrev}
              disabled={!hasPrev}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 text-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {selectedIndex! + 1} of {items.length}
            </span>
            <button
              onClick={goNext}
              disabled={!hasNext}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 text-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
