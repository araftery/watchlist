import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import { getDb } from "~/db";
import { getUserServiceIds } from "~/services/settings.server";
import { STREAMING_SERVICES } from "~/lib/streaming-services";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { useEffect } from "react";
import type { Route } from "./+types/_layout.settings";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const userServiceIds = await getUserServiceIds(db);
  return { userServiceIds };
}

export default function SettingsPage() {
  const { userServiceIds } = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(userServiceIds)
  );
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      toast.success("Streaming services saved");
    }
  }, [fetcher.data, fetcher.state]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSave() {
    fetcher.submit(
      { providerIds: JSON.stringify(Array.from(selected)) },
      { method: "post", action: "/api/settings" }
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your preferences
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">
            My streaming services
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the services you subscribe to. Your services will be
            highlighted on each title.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STREAMING_SERVICES.map((service) => {
            const isSelected = selected.has(service.id);
            return (
              <button
                key={service.id}
                onClick={() => toggle(service.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                  isSelected
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20"
                    : "border-border/40 bg-card/30 hover:border-border/60 hover:bg-card/50"
                )}
              >
                <img
                  src={getTMDBImageUrl(service.logoPath, "w92")!}
                  alt=""
                  className={cn(
                    "h-8 w-8 rounded-lg transition-opacity",
                    isSelected ? "opacity-100" : "opacity-50"
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    isSelected ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {service.name}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          onClick={handleSave}
          className="rounded-xl"
          disabled={fetcher.state !== "idle"}
        >
          {fetcher.state !== "idle" ? "Saving..." : "Save"}
        </Button>
      </section>
    </div>
  );
}
