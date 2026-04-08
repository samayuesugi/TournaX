import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Search, Users, Trophy, SlidersHorizontal, X, Check } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FF_CATEGORIES = ["Battle Royale", "Clash Squad", "Lone Wolf"];
const BGMI_CATEGORIES = ["Classic", "TDM"];

const FF_MAPS = ["Bermuda", "Kalahari", "Purgatory", "Alps", "Nextera", "Aden", "Bermuda Remastered"];
const BGMI_MAPS = ["Erangel", "Miramar", "Sanhok", "Vikendi", "Livik", "Karakin", "Nusa"];

const MODES = ["Solo", "Duo", "Squad"];

interface Filters {
  category: string;
  mode: string;
  map: string;
  paid: "" | "free" | "paid";
}

function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  game,
  isEsportsPlayer,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  game: string;
  isEsportsPlayer: boolean;
}) {
  const [local, setLocal] = useState<Filters>(filters);
  const isFF = game === "Free Fire";
  const isBGMI = game === "BGMI";
  const baseCategories = isFF ? FF_CATEGORIES : isBGMI ? BGMI_CATEGORIES : [];
  const allCategories = isEsportsPlayer ? [...baseCategories, "Esports"] : baseCategories;
  const maps = isFF ? FF_MAPS : isBGMI ? BGMI_MAPS : [];

  useEffect(() => { if (open) setLocal(filters); }, [open]);

  const handleApply = () => { onChange(local); onClose(); };
  const handleClear = () => {
    const cleared: Filters = { category: "", mode: "", map: "", paid: "" };
    setLocal(cleared);
    onChange(cleared);
    onClose();
  };

  const activeCount = [filters.category, filters.mode, filters.map, filters.paid].filter(Boolean).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border-t border-card-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-card-border px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Filters</span>
            {activeCount > 0 && (
              <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <button onClick={handleClear} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear all
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5 pb-8">
          {allCategories.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setLocal(l => ({ ...l, category: "" }))}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    !local.category ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  All
                </button>
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setLocal(l => ({ ...l, category: l.category === cat ? "" : cat }))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1",
                      local.category === cat ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                    )}
                  >
                    {local.category === cat && <Check className="w-3 h-3" />}
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mode</p>
            <div className="flex gap-2">
              <button
                onClick={() => setLocal(l => ({ ...l, mode: "" }))}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-medium border transition-all",
                  !local.mode ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                )}
              >
                All
              </button>
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setLocal(l => ({ ...l, mode: l.mode === m ? "" : m }))}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border transition-all",
                    local.mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {maps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Map</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setLocal(l => ({ ...l, map: "" }))}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    !local.map ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  Any Map
                </button>
                {maps.map((map) => (
                  <button
                    key={map}
                    onClick={() => setLocal(l => ({ ...l, map: l.map === map ? "" : map }))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1",
                      local.map === map ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                    )}
                  >
                    {local.map === map && <Check className="w-3 h-3" />}
                    🗺️ {map}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entry Type</p>
            <div className="flex gap-2">
              {[
                { val: "" as const, label: "All" },
                { val: "free" as const, label: "🆓 Free" },
                { val: "paid" as const, label: "💰 Paid" },
              ].map(({ val, label }) => (
                <button
                  key={val || "all"}
                  onClick={() => setLocal(l => ({ ...l, paid: val }))}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border transition-all",
                    local.paid === val ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full" onClick={handleApply}>
            Apply Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MatchesList({
  game,
  filters,
  search,
}: {
  game: string;
  filters: Filters;
  search: string;
}) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (game) params.set("game", game);
    if (filters.category) params.set("category", filters.category);
    if (filters.mode) {
      const teamSize = filters.mode === "Solo" ? "1" : filters.mode === "Duo" ? "2" : "4";
      params.set("teamSize", teamSize);
    }
    if (filters.map) params.set("map", filters.map);
    if (filters.paid) params.set("paid", filters.paid);
    if (search) params.set("search", search);

    customFetch<any[]>(`/api/matches?${params.toString()}`)
      .then((data) => setMatches((data ?? []).filter((m: any) => m.status !== "completed")))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [game, filters.category, filters.mode, filters.map, filters.paid, search]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
      </div>
    );
  }

  const isPlayer = user?.role === "player";
  const hasFollowing = isPlayer && matches.some((m: any) => !m.isRecommended);
  const hasRecommended = isPlayer && matches.some((m: any) => m.isRecommended);

  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🎮</div>
        <h3 className="font-semibold text-base mb-1">No matches found</h3>
        <p className="text-muted-foreground text-sm mb-4">
          {search ? "Try a different search term" : "Try adjusting your filters or check back later"}
        </p>
        {isPlayer && !search && (
          <Link href="/explore">
            <Button variant="outline" className="gap-2">
              <Users className="w-4 h-4" /> Find Hosts to Follow
            </Button>
          </Link>
        )}
      </div>
    );
  }

  if (isPlayer && (hasFollowing || hasRecommended)) {
    const followingMatches = matches.filter((m: any) => !m.isRecommended);
    const recommendedMatches = matches.filter((m: any) => m.isRecommended);
    return (
      <div className="space-y-6">
        {followingMatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Following</h2>
              <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">{followingMatches.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {followingMatches.map((match) => <MatchCard key={match.id} match={match} />)}
            </div>
          </div>
        )}
        {recommendedMatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Recommended</h2>
              <span className="text-xs font-medium bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">For You</span>
            </div>
            <div className="flex flex-col gap-2">
              {recommendedMatches.map((match) => <MatchCard key={match.id} match={match} />)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => <MatchCard key={match.id} match={match} />)}
    </div>
  );
}

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({ category: "", mode: "", map: "", paid: "" });
  const { user } = useAuth();
  const searchTimer = useRef<any>(null);

  const playerGame = user?.role === "player" ? (user as any).game : null;
  const isEsportsPlayer = user?.role === "player" ? Boolean((user as any).isEsportsPlayer) : false;
  const isGamePlayer = playerGame === "Free Fire" || playerGame === "BGMI";

  const activeFilterCount = [filters.category, filters.mode, filters.map, filters.paid].filter(Boolean).length;

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 400);
  };

  const gameLabel = playerGame === "Free Fire" ? "🔥 Free Fire" : playerGame === "BGMI" ? "🎯 BGMI" : null;

  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">
                {gameLabel ?? "Tournaments"}
              </h1>
              <p className="text-muted-foreground text-xs">
                {isGamePlayer ? "Find and join tournaments" : "Join a match and compete"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEsportsPlayer && (
                <span className="flex items-center gap-1 text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded-full">
                  <Trophy className="w-3 h-3" /> Esports
                </span>
              )}
              {isGamePlayer && (
                <button
                  onClick={() => setFilterOpen(true)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    activeFilterCount > 0
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by game, mode, code..."
              className="pl-9 pr-9"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); setSearch(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filters.category && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                  {filters.category}
                  <button onClick={() => setFilters(f => ({ ...f, category: "" }))}><X className="w-3 h-3" /></button>
                </span>
              )}
              {filters.mode && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                  {filters.mode}
                  <button onClick={() => setFilters(f => ({ ...f, mode: "" }))}><X className="w-3 h-3" /></button>
                </span>
              )}
              {filters.map && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                  🗺️ {filters.map}
                  <button onClick={() => setFilters(f => ({ ...f, map: "" }))}><X className="w-3 h-3" /></button>
                </span>
              )}
              {filters.paid && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                  {filters.paid === "free" ? "🆓 Free" : "💰 Paid"}
                  <button onClick={() => setFilters(f => ({ ...f, paid: "" }))}><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}
        </div>

        <MatchesList
          game={isGamePlayer ? playerGame : ""}
          filters={filters}
          search={search}
        />
      </div>

      {isGamePlayer && (
        <FilterSheet
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onChange={setFilters}
          game={playerGame}
          isEsportsPlayer={isEsportsPlayer}
        />
      )}
    </AppLayout>
  );
}
