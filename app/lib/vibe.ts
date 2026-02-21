export const VIBE_GENRE_IDS: Record<
  "casual" | "engaged",
  Record<"movie" | "tv", number[]>
> = {
  casual: {
    movie: [35, 16, 10751, 10402, 99, 10770], // Comedy, Animation, Family, Music, Documentary, TV Movie
    tv: [35, 10764, 10767, 16, 10751, 99], // Comedy, Reality, Talk, Animation, Family, Documentary
  },
  engaged: {
    movie: [18, 53, 80, 9648, 878, 10752, 36, 37], // Drama, Thriller, Crime, Mystery, SciFi, War, History, Western
    tv: [18, 80, 9648, 10765, 10768, 37], // Drama, Crime, Mystery, SciFi&Fantasy, War&Politics, Western
  },
};

const CASUAL_GENRES = new Set([
  "Reality",
  "Talk",
  "Animation",
  "Family",
  "Music",
  "TV Movie",
  "Documentary",
]);
const ENGAGED_GENRES = new Set([
  "Drama",
  "Thriller",
  "Crime",
  "Mystery",
  "Science Fiction",
  "War",
  "History",
  "Western",
]);

export function guessVibe(
  genreNames: string[]
): "casual" | "engaged" | null {
  let casualScore = 0;
  let engagedScore = 0;

  for (const g of genreNames) {
    if (CASUAL_GENRES.has(g)) casualScore++;
    if (ENGAGED_GENRES.has(g)) engagedScore++;
  }

  if (casualScore > engagedScore) return "casual";
  if (engagedScore > casualScore) return "engaged";
  return null;
}
