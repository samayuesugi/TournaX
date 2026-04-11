import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Pin, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Player {
  id: number;
  name: string;
  handle: string | null;
  avatar: string | null;
  game: string | null;
  trustScore: number;
  tournamentWins: number;
}

export default function LeaderboardControlsPage() {
  const { toast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [featuredIds, setFeaturedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await customFetch<{ featuredPlayerIds: number[]; players: Player[] }>("/api/admin/leaderboard-ctrl");
      setPlayers(data.players);
      setFeaturedIds(data.featuredPlayerIds);
    } catch {
      toast({ title: "Failed to load leaderboard data", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleFeature = async (id: number) => {
    try {
      const res = await customFetch<{ success: boolean; featured: boolean }>(`/api/admin/leaderboard-ctrl/feature/${id}`, {
        method: "POST", responseType: "json",
      });
      setFeaturedIds(prev => res.featured ? [...prev, id] : prev.filter(x => x !== id));
      toast({ title: res.featured ? "Player pinned to top" : "Player unpinned" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await customFetch("/api/admin/leaderboard-ctrl/reset", { method: "POST", responseType: "json" });
      setFeaturedIds([]);
      setResetOpen(false);
      toast({ title: "Featured list cleared" });
    } catch {
      toast({ title: "Failed to reset", variant: "destructive" });
    }
    setResetting(false);
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const aF = featuredIds.includes(a.id) ? 1 : 0;
    const bF = featuredIds.includes(b.id) ? 1 : 0;
    return bF - aF;
  });

  return (
    <AppLayout title="Leaderboard Controls" showBack backHref="/admin">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{featuredIds.length} player{featuredIds.length !== 1 ? "s" : ""} pinned</p>
          {featuredIds.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-destructive border-destructive/30"
              onClick={() => setResetOpen(true)}>
              <RotateCcw className="w-3.5 h-3.5" /> Clear All
            </Button>
          )}
        </div>

        {loading ? (
          [1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : players.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No players found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedPlayers.map((p, i) => {
              const featured = featuredIds.includes(p.id);
              return (
                <div key={p.id} className={cn("flex items-center gap-3 bg-card border rounded-xl px-4 py-3",
                  featured ? "border-primary/40 bg-primary/4" : "border-card-border")}>
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0 overflow-hidden">
                    {p.avatar && (p.avatar.startsWith("/") || p.avatar.startsWith("http"))
                      ? <img src={p.avatar} alt={p.name || ""} className="w-full h-full object-cover" />
                      : p.avatar || "🔥"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {featured && <Pin className="w-3 h-3 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.handle ? `@${p.handle} · ` : ""}{p.trustScore} trust · {p.tournamentWins} wins
                    </p>
                  </div>
                  <Button size="sm" variant={featured ? "default" : "outline"} className="h-8 text-xs shrink-0"
                    onClick={() => handleFeature(p.id)}>
                    {featured ? "Unpin" : "Pin"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Clear Featured List?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">All {featuredIds.length} pinned players will be removed from the featured list.</p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>{resetting ? "Clearing..." : "Clear All"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
