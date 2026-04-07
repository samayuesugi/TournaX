import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Search, Users, Trophy } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FF_CATEGORIES = [
  { id: "Battle Royale", label: "Battle Royale", modes: ["Solo", "Duo", "Squad"] },
  { id: "Clash Squad", label: "Clash Squad", modes: ["Solo", "Duo", "Squad"] },
  { id: "Lone Wolf", label: "Lone Wolf", modes: ["Solo", "Duo"] },
];

const BGMI_CATEGORIES = [
  { id: "Classic", label: "Classic", modes: ["Solo", "Duo", "Squad"] },
  { id: "TDM", label: "TDM", modes: ["Solo", "Duo", "Squad"] },
];

const ESPORTS_CATEGORY = { id: "Esports", label: "Esports", modes: ["Solo", "Duo", "Squad"] };

function MatchesList({ game, category, mode }: { game: string; category: string; mode: string }) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("game", game);
    params.set("category", category);
    const teamSize = mode === "Solo" ? "1" : mode === "Duo" ? "2" : "4";
    params.set("teamSize", teamSize);
    customFetch<any[]>(`/api/matches?${params.toString()}`)
      .then((data) => setMatches((data ?? []).filter((m: any) => m.status !== "completed")))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [game, category, mode]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🎮</div>
        <h3 className="font-semibold text-base mb-1">No matches yet</h3>
        <p className="text-muted-foreground text-sm">No {mode} {category} tournaments available right now</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => <MatchCard key={match.id} match={match} />)}
    </div>
  );
}

function GameHomePage({ game, isEsportsPlayer }: { game: string; isEsportsPlayer: boolean }) {
  const isFF = game === "Free Fire";
  const isBGMI = game === "BGMI";

  const baseCategories = isFF ? FF_CATEGORIES : isBGMI ? BGMI_CATEGORIES : [];
  const categories = isEsportsPlayer ? [...baseCategories, ESPORTS_CATEGORY] : baseCategories;

  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id ?? "");
  const activeCat = categories.find(c => c.id === selectedCategory) ?? categories[0];
  const [selectedMode, setSelectedMode] = useState(activeCat?.modes[0] ?? "Solo");

  useEffect(() => {
    const cat = categories.find(c => c.id === selectedCategory);
    if (cat && !cat.modes.includes(selectedMode)) {
      setSelectedMode(cat.modes[0]);
    }
  }, [selectedCategory]);

  if (categories.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🎮</div>
        <h3 className="font-semibold text-base mb-1">Select a game in your profile</h3>
        <p className="text-muted-foreground text-sm">Go to your profile and tap the edit icon to select a game</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-semibold shrink-0 border transition-all",
              selectedCategory === cat.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {activeCat && (
        <div className="flex gap-2">
          {activeCat.modes.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMode(m)}
              className={cn(
                "flex-1 py-1.5 rounded-xl border text-xs font-medium transition-all",
                selectedMode === m
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {activeCat && selectedMode && (
        <MatchesList game={game} category={activeCat.id} mode={selectedMode} />
      )}
    </div>
  );
}

function GenericMatchesList({ search }: { search: string }) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    customFetch<any[]>(`/api/matches?${params.toString()}`)
      .then((data) => setMatches((data ?? []).filter((m: any) => m.status !== "completed")))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [search]);

  const isPlayer = user?.role === "player";
  const followingMatches = isPlayer ? matches.filter((m: any) => !m.isRecommended) : matches;
  const recommendedMatches = isPlayer ? matches.filter((m: any) => m.isRecommended) : [];

  if (loading) {
    return <div className="space-y-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>;
  }

  if (isPlayer) {
    return (
      <div className="space-y-6">
        {followingMatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Following</h2>
              <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">{followingMatches.length}</span>
            </div>
            <div className="flex flex-col gap-2">{followingMatches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
          </div>
        )}
        {recommendedMatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Recommended</h2>
              <span className="text-xs font-medium bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">For You</span>
            </div>
            <div className="flex flex-col gap-2">{recommendedMatches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
          </div>
        )}
        {followingMatches.length === 0 && recommendedMatches.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="font-semibold text-base mb-1">No matches yet</h3>
            <p className="text-muted-foreground text-sm mb-4">{search ? "Try a different search" : "Follow hosts to see their matches here"}</p>
            {!search && (
              <Link href="/explore">
                <Button variant="outline" className="gap-2"><Users className="w-4 h-4" />Find Hosts</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🎮</div>
        <h3 className="font-semibold text-base mb-1">No matches found</h3>
        <p className="text-muted-foreground text-sm">{search ? "Try a different search" : "Check back later for upcoming tournaments"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
  );
}

export default function HomePage() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();

  const playerGame = user?.role === "player" ? (user as any).game : null;
  const isEsportsPlayer = user?.role === "player" ? Boolean((user as any).isEsportsPlayer) : false;
  const isGamePlayer = playerGame === "Free Fire" || playerGame === "BGMI";

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">
                {isGamePlayer ? (
                  <span className="flex items-center gap-2">
                    {playerGame === "Free Fire" ? "🔥" : "🎯"} {playerGame}
                  </span>
                ) : "Tournaments"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {isGamePlayer ? "Select category and mode" : "Join a match and compete"}
              </p>
            </div>
            {isEsportsPlayer && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded-full">
                <Trophy className="w-3 h-3" /> Esports
              </span>
            )}
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
        </div>

        {search ? (
          <GenericMatchesList search={search} />
        ) : isGamePlayer ? (
          <GameHomePage game={playerGame} isEsportsPlayer={isEsportsPlayer} />
        ) : (
          <GenericMatchesList search={search} />
        )}
      </div>
    </AppLayout>
  );
}
