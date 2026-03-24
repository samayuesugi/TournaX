import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Swords, DollarSign, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

const GAMES = ["all", "BGMI", "Free Fire", "COD Mobile", "Valorant", "PUBG PC"];

interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  handle: string;
  avatar: string;
  game: string | null;
  totalMatches: number;
  wins: number;
  totalEarnings: number;
}

const rankColors = ["text-yellow-400", "text-slate-400", "text-amber-600"];
const rankBgs = ["bg-yellow-400/10 border-yellow-400/30", "bg-slate-400/10 border-slate-400/30", "bg-amber-600/10 border-amber-600/30"];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-400 shrink-0" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600 shrink-0" />;
  return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">#{rank}</span>;
}

function LeaderboardList({ data, type, isLoading }: { data: LeaderboardEntry[] | undefined; type: string; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2 mt-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }
  if (!data?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
        No data yet. Play some matches to appear here!
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      {data.map((entry) => {
        const isTop3 = entry.rank <= 3;
        return (
          <div
            key={entry.id}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 border",
              isTop3 ? rankBgs[entry.rank - 1] : "bg-card border-card-border"
            )}
          >
            <RankBadge rank={entry.rank} />
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-lg shrink-0">
              {entry.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("font-semibold text-sm truncate", isTop3 && rankColors[entry.rank - 1])}>
                {entry.name}
              </div>
              <div className="text-xs text-muted-foreground">@{entry.handle}{entry.game ? ` · ${entry.game}` : ""}</div>
            </div>
            <div className="text-right shrink-0">
              {type === "wins" && (
                <>
                  <div className={cn("font-bold text-sm", isTop3 ? rankColors[entry.rank - 1] : "text-foreground")}>{entry.wins}</div>
                  <div className="text-[10px] text-muted-foreground">wins</div>
                </>
              )}
              {type === "earnings" && (
                <>
                  <div className={cn("font-bold text-sm text-green-400")}> ₹{entry.totalEarnings.toFixed(0)}</div>
                  <div className="text-[10px] text-muted-foreground">earned</div>
                </>
              )}
              {type === "matches" && (
                <>
                  <div className={cn("font-bold text-sm", isTop3 ? rankColors[entry.rank - 1] : "text-foreground")}>{entry.totalMatches}</div>
                  <div className="text-[10px] text-muted-foreground">played</div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardTab({ game, type }: { game: string; type: string }) {
  const { data, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", game, type],
    queryFn: () => customFetch(`/api/leaderboard?game=${encodeURIComponent(game)}&type=${type}`),
  });
  return <LeaderboardList data={data} type={type} isLoading={isLoading} />;
}

export default function LeaderboardPage() {
  const [game, setGame] = useState("all");

  return (
    <AppLayout title="Leaderboard">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Top players across all tournaments</p>
          <Select value={game} onValueChange={setGame}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAMES.map(g => (
                <SelectItem key={g} value={g}>{g === "all" ? "All Games" : g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="wins">
          <TabsList className="w-full">
            <TabsTrigger value="wins" className="flex-1 gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Wins
            </TabsTrigger>
            <TabsTrigger value="earnings" className="flex-1 gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Earnings
            </TabsTrigger>
            <TabsTrigger value="matches" className="flex-1 gap-1.5">
              <Swords className="w-3.5 h-3.5" /> Matches
            </TabsTrigger>
          </TabsList>
          <TabsContent value="wins"><LeaderboardTab game={game} type="wins" /></TabsContent>
          <TabsContent value="earnings"><LeaderboardTab game={game} type="earnings" /></TabsContent>
          <TabsContent value="matches"><LeaderboardTab game={game} type="matches" /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
