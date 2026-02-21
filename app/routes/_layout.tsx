import { NavLink, Outlet, useLoaderData } from "react-router";
import { Home, Compass, Tv, Search, List, Film, Settings } from "lucide-react";
import { Toaster } from "~/components/ui/sonner";
import { getDb } from "~/db";
import { getUserServiceIds } from "~/services/settings.server";
import type { Route } from "./+types/_layout";
import type { LayoutContext } from "~/lib/layout-context";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/discover", icon: Compass, label: "Discover" },
  { to: "/following", icon: Tv, label: "Following" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/watchlist", icon: List, label: "Watchlist" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const mobileNavItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/discover", icon: Compass, label: "Discover" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/following", icon: Tv, label: "Following" },
  { to: "/watchlist", icon: List, label: "Watchlist" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const userServiceIds = await getUserServiceIds(db);
  return { userServiceIds };
}

export default function AppLayout() {
  const { userServiceIds } = useLoaderData<typeof loader>();

  const outletContext: LayoutContext = { userServiceIds };

  return (
    <div className="noise-bg min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-60 border-r border-border/50 bg-card/80 backdrop-blur-xl md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2.5 border-b border-border/50 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Film className="h-4 w-4 text-primary" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-gradient-amber">
            Watchlist
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_oklch(0.78_0.14_75_/_0.15)]"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="relative pb-20 md:pl-60 md:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
          <Outlet context={outletContext} />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-card/90 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-around px-2">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-all ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground/60"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`rounded-xl p-1.5 transition-all ${isActive ? "bg-primary/12" : ""}`}>
                    <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                  </div>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Toaster
        position="top-center"
        toastOptions={{
          className: "!bg-card !border-border/50 !text-foreground",
        }}
      />
    </div>
  );
}
