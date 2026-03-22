import { useState } from "react";
import { Search, Filter } from "lucide-react";
import { useListMatches } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "upcoming", "live", "completed"] as const;
type Filter = typeof FILTERS[number];

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: matches, isLoading } = useListMatches(
    { status: filter === "all" ? undefined : filter, search: search || undefined },
    { query: { staleTime: 10000 } }
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-bold">Tournaments</h1>
            <p className="text-muted-foreground text-sm">Join a match and compete</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by game, mode, code..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 border transition-all capitalize",
                  filter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : matches && matches.length > 0 ? (
          <div className="space-y-5">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="font-semibold text-base mb-1">No matches found</h3>
            <p className="text-muted-foreground text-sm">
              {search ? "Try a different search" : "Check back later for upcoming tournaments"}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
