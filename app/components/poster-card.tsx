import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { getTMDBImageUrl } from "~/lib/tmdb-image";

interface PosterCardProps {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  mediaType: "movie" | "tv";
  providers?: Array<{ logoPath: string | null; providerName: string; providerId: number | null }>;
  status?: string;
  userServiceIds?: number[];
  onClick?: () => void;
  linkTo?: string;
  overlay?: React.ReactNode;
}

function pickProvider(
  providers: PosterCardProps["providers"],
  userServiceIds?: number[]
) {
  if (!providers || providers.length === 0) return null;
  if (userServiceIds && userServiceIds.length > 0) {
    const userProvider = providers.find(
      (p) => p.providerId != null && userServiceIds.includes(p.providerId)
    );
    if (userProvider) return userProvider;
  }
  return providers[0];
}

export function PosterCard({
  id,
  title,
  posterPath,
  releaseDate,
  mediaType,
  providers = [],
  status,
  userServiceIds,
  onClick,
  linkTo,
  overlay,
}: PosterCardProps) {
  const provider = pickProvider(providers, userServiceIds);

  const content = (
    <>
      <div className="poster-glow relative overflow-hidden rounded-xl">
        <img
          src={getTMDBImageUrl(posterPath, "w342") || "/placeholder.svg"}
          alt={title}
          className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.08]"
          loading="lazy"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {/* Provider icon */}
        {provider?.logoPath && (
          <img
            src={getTMDBImageUrl(provider.logoPath, "w92")!}
            alt={provider.providerName}
            className="absolute bottom-2 right-2 h-7 w-7 rounded-md shadow-lg ring-1 ring-black/20"
          />
        )}
        {/* Status badge */}
        {status && status !== "to_watch" && (
          <Badge
            className={`absolute left-2 top-2 text-[10px] font-semibold shadow-lg ${
              status === "watching"
                ? "border-primary/40 bg-primary/20 text-primary backdrop-blur-sm"
                : status === "watched"
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400 backdrop-blur-sm"
                  : "border-border/50 bg-card/80 text-muted-foreground backdrop-blur-sm"
            }`}
          >
            {status === "watching"
              ? "Watching"
              : status === "watched"
                ? "Watched"
                : status === "dropped"
                  ? "Dropped"
                  : ""}
          </Badge>
        )}
        {/* Custom overlay */}
        {overlay}
      </div>
      <div className="space-y-0.5 px-0.5">
        <p className="truncate text-sm font-medium leading-snug group-hover:text-primary transition-colors duration-200">
          {title}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <span className="uppercase tracking-wide">{mediaType === "movie" ? "Film" : "Series"}</span>
          {releaseDate && (
            <>
              <span className="text-border">·</span>
              <span>{releaseDate.split("-")[0]}</span>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (onClick && !linkTo) {
    return (
      <button onClick={onClick} className="group space-y-2 text-left">
        {content}
      </button>
    );
  }

  return (
    <Link to={linkTo || `/item/${id}`} className="group space-y-2">
      {content}
    </Link>
  );
}
