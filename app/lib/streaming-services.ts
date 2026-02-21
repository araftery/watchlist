export interface StreamingService {
  id: number; // TMDB provider_id
  name: string;
  logoPath: string; // TMDB logo_path
}

/**
 * Curated list of major US streaming services with their TMDB provider IDs.
 * Logo paths are TMDB image paths (use getTMDBImageUrl to build full URL).
 */
export const STREAMING_SERVICES: StreamingService[] = [
  { id: 8, name: "Netflix", logoPath: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg" },
  { id: 1899, name: "Max", logoPath: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg" },
  { id: 15, name: "Hulu", logoPath: "/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg" },
  { id: 337, name: "Disney+", logoPath: "/97yvRBw1GzX7fXprcF80er19ot.jpg" },
  { id: 9, name: "Amazon Prime Video", logoPath: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg" },
  { id: 350, name: "Apple TV+", logoPath: "/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg" },
  { id: 386, name: "Peacock", logoPath: "/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg" },
  { id: 2528, name: "YouTube TV", logoPath: "/x9zOHTUkQzt3PgPVKbMH9CKBwLK.jpg" },
];

/** Set of all curated TMDB provider IDs for quick lookup */
export const STREAMING_SERVICE_IDS = new Set(STREAMING_SERVICES.map((s) => s.id));
