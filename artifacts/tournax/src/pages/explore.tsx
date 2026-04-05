import { useState } from "react";
import { Link } from "wouter";
import { Search, Trophy, DollarSign, Swords, Medal, UserPlus, UserCheck } from "lucide-react";
import { GoldCoin } from "@/components/ui/Coins";
import { useExploreUsers, customFetch, useFollowUser, useUnfollowUser } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/useAuth";

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
  if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-400 shrink-0" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600 shrink-0" />;
  return <span className="w-4 text-center text-xs font-bold text-muted-foreground shrink-0">#{rank}</span>;
}

function LeaderboardCard({ entry, type }: { entry: LeaderboardEntry; type: string }) {
  const isTop3 = entry.rank <= 3;
  const inner = (
    <div className={cn(
      "flex items-center gap-3 rounded-xl px-4 py-3 border transition-all",
      isTop3 ? rankBgs[entry.rank - 1] : "bg-card border-card-border hover:border-primary/30"
    )}>
      <RankBadge rank={entry.rank} />
      <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-lg shrink-0">
        {entry.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("font-semibold text-sm truncate", isTop3 && rankColors[entry.rank - 1])}>
          {entry.name}
        </div>
        <div className="text-xs text-muted-foreground">
          @{entry.handle}{entry.game ? ` · ${entry.game}` : ""}
        </div>
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
            <div className="font-bold text-sm text-green-400"><GoldCoin amount={entry.totalEarnings.toFixed(0)} /></div>
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

  if (!entry.handle) return inner;
  return <Link href={`/profile/${entry.handle}`}>{inner}</Link>;
}

function TopPlayersSection() {
  const [game, setGame] = useState("all");
  const [type, setType] = useState("wins");

  const { data, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", game, type],
    queryFn: () => customFetch(`/api/leaderboard?game=${encodeURIComponent(game)}&type=${type}`),
  });

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center gap-2">
        <Select value={game} onValueChange={setGame}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAMES.map(g => (
              <SelectItem key={g} value={g}>{g === "all" ? "All Games" : g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wins">By Wins</SelectItem>
            <SelectItem value="earnings">By Earnings</SelectItem>
            <SelectItem value="matches">By Matches</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : data?.length ? (
        <div className="flex flex-col gap-1.5">
          {data.map(entry => <LeaderboardCard key={entry.id} entry={entry} type={type} />)}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No data yet. Play some matches to appear here!
        </div>
      )}
    </div>
  );
}

function UserCard({ profile }: { profile: UserProfile }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(profile.isFollowing ?? false);
  const { mutateAsync: follow, isPending: isFollowing } = useFollowUser();
  const { mutateAsync: unfollow, isPending: isUnfollowing } = useUnfollowUser();

  const isSelf = user?.id === profile.id;

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (following) {
        await unfollow({ handle: profile.handle! });
        setFollowing(false);
      } else {
        await follow({ handle: profile.handle! });
        setFollowing(true);
      }
      queryClient.invalidateQueries({ queryKey: ["exploreUsers"] });
    } catch {}
  };

  const card = (
    <div className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:border-primary/30 transition-all cursor-pointer">
      {(profile.avatar?.startsWith("/") || profile.avatar?.startsWith("http")) ? (
        <img src={profile.avatar.startsWith("/objects/") ? `/api/storage${profile.avatar}` : profile.avatar} alt="avatar" className="w-11 h-11 rounded-xl object-cover bg-secondary shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center text-xl shrink-0">
          {profile.avatar || "🎮"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{profile.name || `@${profile.handle}`}</div>
        <div className="text-xs text-muted-foreground">@{profile.handle || "no handle"} · {profile.role}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{profile.followersCount} followers · {profile.matchesCount} matches</div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {profile.rating && (
          <div className="text-right">
            <div className="text-sm font-bold text-accent">{profile.rating.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">rating</div>
          </div>
        )}
        {user && !isSelf && profile.handle && (
          <Button
            size="sm"
            variant={following ? "secondary" : "default"}
            className={cn("h-7 px-2.5 text-xs gap-1 shrink-0", following ? "" : "")}
            onClick={handleFollowToggle}
            disabled={isFollowing || isUnfollowing}
          >
            {following
              ? <><UserCheck className="w-3 h-3" /> Following</>
              : <><UserPlus className="w-3 h-3" /> Follow</>
            }
          </Button>
        )}
      </div>
    </div>
  );

  if (!profile.handle) return card;
  return <Link href={`/profile/${profile.handle}`}>{card}</Link>;
}

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useExploreUsers(
    { search: search || undefined },
    { query: { staleTime: 30000 } }
  );

  return (
    <AppLayout title="Explore">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search players, hosts..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs defaultValue="hosts">
          <TabsList className="w-full">
            <TabsTrigger value="hosts" className="flex-1">Top Hosts</TabsTrigger>
            <TabsTrigger value="players" className="flex-1 gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hosts">
            {isLoading ? (
              <div className="space-y-2 mt-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : data?.recommendedHosts.length ? (
              <div className="flex flex-col gap-1 mt-3">
                {data.recommendedHosts.map((h) => <UserCard key={h.id} profile={h} />)}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">No hosts found</div>
            )}
          </TabsContent>

          <TabsContent value="players">
            <TopPlayersSection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
