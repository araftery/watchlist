import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/_layout.tsx", [
    index("routes/_layout._index.tsx"),
    route("discover", "routes/_layout.discover.tsx"),
    route("following", "routes/_layout.following.tsx"),
    route("search", "routes/_layout.search.tsx"),
    route("item/:id", "routes/_layout.item.$id.tsx"),
    route("watchlist", "routes/_layout.watchlist.tsx"),
    route("settings", "routes/_layout.settings.tsx"),
  ]),
  route("api/pick", "routes/api.pick.tsx"),
  route("api/tmdb/search", "routes/api.tmdb.search.tsx"),
  route("api/tmdb/details", "routes/api.tmdb.details.tsx"),
  route("api/settings", "routes/api.settings.tsx"),
  route("api/watchlist/add", "routes/api.watchlist.add.tsx"),
] satisfies RouteConfig;
