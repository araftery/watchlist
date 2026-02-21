import { useState } from "react";
import { Play, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { TMDBTrailer } from "~/lib/types";

interface TrailerButtonProps {
  trailer: TMDBTrailer;
}

export function TrailerButton({ trailer }: TrailerButtonProps) {
  const [showPlayer, setShowPlayer] = useState(false);

  if (showPlayer) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
            title={trailer.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full rounded-xl"
          />
        </div>
        <button
          onClick={() => setShowPlayer(false)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={() => setShowPlayer(true)}
      className="gap-2 rounded-xl border-border/50 hover:border-primary/50 hover:text-primary"
    >
      <Play className="h-4 w-4" />
      Watch Trailer
    </Button>
  );
}
