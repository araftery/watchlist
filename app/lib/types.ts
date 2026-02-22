export interface TMDBSearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  releaseDate: string;
  voteAverage: number;
  genreIds: number[];
}

export interface TMDBTrailer {
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface WatchProvider {
  providerType: "flatrate" | "rent" | "buy";
  providerId: number;
  providerName: string;
  logoPath: string | null;
  displayPriority: number;
}

export interface TMDBSeasonSummary {
  id: number;
  name: string;
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
  overview: string;
}

export type ItemStatus = "to_watch" | "watching" | "watched" | "dropped";
export type Vibe = "casual" | "engaged";
export type MediaType = "movie" | "tv";
