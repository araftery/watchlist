import { TMDB } from "tmdb-ts";

function getClient(accessToken: string): TMDB {
  return new TMDB(accessToken, { fetch: fetch.bind(globalThis) });
}

export type { TMDBSearchResult, WatchProvider, TMDBTrailer } from "~/lib/types";
import type { TMDBSearchResult, WatchProvider, TMDBTrailer } from "~/lib/types";

export async function searchMulti(
  accessToken: string,
  query: string,
  page = 1
): Promise<{ results: TMDBSearchResult[]; totalPages: number }> {
  const client = getClient(accessToken);
  const response = await client.search.multi({ query, page });

  const results: TMDBSearchResult[] = response.results
    .filter(
      (r): r is Extract<(typeof response.results)[number], { media_type: "movie" | "tv" }> =>
        r.media_type === "movie" || r.media_type === "tv"
    )
    .map((r) => ({
      id: r.id,
      title: r.media_type === "movie" ? (r as any).title : (r as any).name,
      mediaType: r.media_type,
      posterPath: r.poster_path,
      backdropPath: r.backdrop_path,
      overview: r.overview || "",
      releaseDate:
        r.media_type === "movie"
          ? (r as any).release_date || ""
          : (r as any).first_air_date || "",
      voteAverage: r.vote_average || 0,
      genreIds: r.genre_ids || [],
    }));

  return { results, totalPages: response.total_pages };
}

export async function searchMovies(
  accessToken: string,
  query: string,
  page = 1
) {
  const client = getClient(accessToken);
  const response = await client.search.movies({ query, page });

  const results: TMDBSearchResult[] = response.results.map((r) => ({
    id: r.id,
    title: r.title,
    mediaType: "movie" as const,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    overview: r.overview || "",
    releaseDate: r.release_date || "",
    voteAverage: r.vote_average || 0,
    genreIds: r.genre_ids || [],
  }));

  return { results, totalPages: response.total_pages };
}

export async function searchTVShows(
  accessToken: string,
  query: string,
  page = 1
) {
  const client = getClient(accessToken);
  const response = await client.search.tvShows({ query, page });

  const results: TMDBSearchResult[] = response.results.map((r) => ({
    id: r.id,
    title: r.name,
    mediaType: "tv" as const,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    overview: r.overview || "",
    releaseDate: r.first_air_date || "",
    voteAverage: r.vote_average || 0,
    genreIds: r.genre_ids || [],
  }));

  return { results, totalPages: response.total_pages };
}

export async function getMovieDetails(accessToken: string, movieId: number) {
  const client = getClient(accessToken);
  return client.movies.details(movieId);
}

export async function getTVDetails(accessToken: string, tvId: number) {
  const client = getClient(accessToken);
  return client.tvShows.details(tvId);
}

export async function getSeasonDetails(
  accessToken: string,
  tvId: number,
  seasonNumber: number
) {
  const client = getClient(accessToken);
  return client.tvSeasons.details({ tvShowID: tvId, seasonNumber });
}

export async function getWatchProviders(
  accessToken: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<WatchProvider[]> {
  const client = getClient(accessToken);

  const response =
    mediaType === "movie"
      ? await client.movies.watchProviders(tmdbId)
      : await client.tvShows.watchProviders(tmdbId);

  const usProviders = (response.results as any)?.US;
  if (!usProviders) return [];

  const providers: WatchProvider[] = [];

  for (const type of ["flatrate", "rent", "buy"] as const) {
    const list = usProviders[type];
    if (Array.isArray(list)) {
      for (const p of list) {
        providers.push({
          providerType: type,
          providerId: p.provider_id,
          providerName: p.provider_name,
          logoPath: p.logo_path,
          displayPriority: p.display_priority ?? 99,
        });
      }
    }
  }

  return providers;
}

export async function getTrailer(
  accessToken: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TMDBTrailer | null> {
  const client = getClient(accessToken);

  const response =
    mediaType === "movie"
      ? await client.movies.videos(tmdbId)
      : await client.tvShows.videos(tmdbId);

  const videos = (response.results as any[]).filter(
    (v) => v.site === "YouTube"
  );

  // Priority: official trailer > any trailer > teaser > any YouTube video
  const officialTrailer = videos.find(
    (v) => v.type === "Trailer" && v.official
  );
  if (officialTrailer)
    return {
      key: officialTrailer.key,
      name: officialTrailer.name,
      site: officialTrailer.site,
      type: officialTrailer.type,
    };

  const anyTrailer = videos.find((v) => v.type === "Trailer");
  if (anyTrailer)
    return {
      key: anyTrailer.key,
      name: anyTrailer.name,
      site: anyTrailer.site,
      type: anyTrailer.type,
    };

  const teaser = videos.find((v) => v.type === "Teaser");
  if (teaser)
    return {
      key: teaser.key,
      name: teaser.name,
      site: teaser.site,
      type: teaser.type,
    };

  if (videos.length > 0)
    return {
      key: videos[0].key,
      name: videos[0].name,
      site: videos[0].site,
      type: videos[0].type,
    };

  return null;
}

export async function getGenreList(accessToken: string) {
  const client = getClient(accessToken);
  const [movieGenres, tvGenres] = await Promise.all([
    client.genres.movies(),
    client.genres.tvShows(),
  ]);

  return {
    movie: movieGenres.genres,
    tv: tvGenres.genres,
  };
}

function normalizeMovieResult(r: any): TMDBSearchResult {
  return {
    id: r.id,
    title: r.title,
    mediaType: "movie" as const,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    overview: r.overview || "",
    releaseDate: r.release_date || "",
    voteAverage: r.vote_average || 0,
    genreIds: r.genre_ids || [],
  };
}

function normalizeTVResult(r: any): TMDBSearchResult {
  return {
    id: r.id,
    title: r.name,
    mediaType: "tv" as const,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    overview: r.overview || "",
    releaseDate: r.first_air_date || "",
    voteAverage: r.vote_average || 0,
    genreIds: r.genre_ids || [],
  };
}

export async function getTrending(
  accessToken: string,
  mediaType: "movie" | "tv",
  timeWindow: "day" | "week" = "week",
  page = 1
): Promise<{ results: TMDBSearchResult[]; totalPages: number }> {
  const client = getClient(accessToken);
  const response = await client.trending.trending(mediaType, timeWindow, { page });

  const results = (response.results as any[]).map((r) =>
    mediaType === "movie" ? normalizeMovieResult(r) : normalizeTVResult(r)
  );

  return { results, totalPages: response.total_pages };
}

export async function discoverMovies(
  accessToken: string,
  options: Record<string, any> = {}
): Promise<{ results: TMDBSearchResult[]; totalPages: number }> {
  const client = getClient(accessToken);
  const response = await client.discover.movie(options);

  const results = (response.results as any[]).map(normalizeMovieResult);
  return { results, totalPages: response.total_pages };
}

export async function discoverTVShows(
  accessToken: string,
  options: Record<string, any> = {}
): Promise<{ results: TMDBSearchResult[]; totalPages: number }> {
  const client = getClient(accessToken);
  const response = await client.discover.tvShow(options);

  const results = (response.results as any[]).map(normalizeTVResult);
  return { results, totalPages: response.total_pages };
}

export async function getNowPlayingMovies(
  accessToken: string,
  page = 1
): Promise<{ results: TMDBSearchResult[]; totalPages: number }> {
  const client = getClient(accessToken);
  const response = await client.movies.nowPlaying({ region: "US", page });

  const results = (response.results as any[]).map(normalizeMovieResult);
  return { results, totalPages: response.total_pages };
}

export async function getOnTheAirTVShows(
  accessToken: string,
  page = 1
): Promise<{ results: TMDBSearchResult[]; totalPages: number }> {
  const client = getClient(accessToken);
  const response = await client.tvShows.onTheAir({ page });

  const results = (response.results as any[]).map(normalizeTVResult);
  return { results, totalPages: response.total_pages };
}

export { guessVibe } from "~/lib/vibe";
