import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Swords, DollarSign, Medal, Target, Percent, Gamepad2 } from "lucide-react";
import { GoldCoin } from "@/components/ui/Coins";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/useAuth";
import { isImageAvatar, resolveAvatarSrc } from "@/lib/host-avatars";

const GAMES = ["BGMI", "Free Fire", "COD Mobile", "Valorant", "PUBG PC", "Clash Royale", "Clash of Clans", "Pokemon Unite", "Mobile Legends", "Minecraft"];

const STAT_OPTIONS = [
  { value: "wins",     label: "Wins",          icon: Trophy },
  { value: "earnings", label: "Earnings",       icon: DollarSign },
  { value: "matches",  label: "Matches Played", icon: Swords },
];

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
const rankBgs   = [
  "bg-yellow-400/10 border-yellow-400/30",
  "bg-slate-400/10 border-slate-400/30",
  "bg-amber-600/10 border-amber-600/30",
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />;
  if (rank === 2) return <Medal  className="w-5 h-5 text-slate-400   shrink-0" />;
  if (rank === 3) return <Medal  className="w-5 h-5 text-amber-600   shrink-0" />;
  return (
    <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
      #{rank}
    </span>
  );
}

function StatValue({ entry, type }: { entry: LeaderboardEntry; type: string }) {
  const isTop3 = entry.rank <= 3;
  if (type === "wins") return (
    <div className="text-right shrink-0">
      <div className={cn("font-bold text-sm", isTop3 ? rankColors[entry.rank - 1] : "text-foreground")}>{entry.wins}</div>
      <div className="text-[10px] text-muted-foreground">wins</div>
    </div>
  );
  if (type === "earnings") return (
    <div className="text-right shrink-0">
      <div className="font-bold text-sm text-green-400"><GoldCoin amount={entry.totalEarnings.toFixed(0)} /></div>
      <div className="text-[10px] text-muted-foreground">earned</div>
    </div>
  );
  return (
    <div className="text-right shrink-0">
      <div className={cn("font-bold text-sm", isTop3 ? rankColors[entry.rank - 1] : "text-foreground")}>{entry.totalMatches}</div>
      <div className="text-[10px] text-muted-foreground">played</div>
    </div>
  );
}

function LeaderboardList({
  data, type, isLoading, currentUserId,
}: {
  data: LeaderboardEntry[] | undefined;
  type: string;
  isLoading: boolean;
  currentUserId?: number;
}) {
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
        const isTop3  = entry.rank <= 3;
        const isMe    = entry.id === currentUserId;
        return (
          <div
            key={entry.id}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors",
              isMe      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
              : isTop3  ? rankBgs[entry.rank - 1]
              : "bg-card border-card-border",
            )}
          >
            <RankBadge rank={entry.rank} />
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-lg shrink-0 overflow-hidden">
              {entry.avatar && isImageAvatar(entry.avatar)
                ? <img src={resolveAvatarSrc(entry.avatar)} alt="" className="w-full h-full object-cover" />
                : <span>{entry.avatar || "🎮"}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-semibold text-sm truncate",
                isMe ? "text-primary" : isTop3 ? rankColors[entry.rank - 1] : "",
              )}>
                {entry.name}
                {isMe && <span className="ml-1.5 text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase">You</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                @{entry.handle}{entry.game ? ` · ${entry.game}` : ""}
              </div>
            </div>
            <StatValue entry={entry} type={type} />
          </div>
        );
      })}
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const userGame = (user as any)?.game as string | undefined;

  const [game,      setGame]      = useState<string>(userGame ?? GAMES[0]);
  const [timeframe, setTimeframe] = useState("all");
  const [statType,  setStatType]  = useState("wins");

  const { data, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", game, statType, timeframe],
    queryFn:  () => customFetch(`/api/leaderboard?game=${encodeURIComponent(game)}&type=${statType}&timeframe=${timeframe}`),
  });

  const StatIcon = STAT_OPTIONS.find(s => s.value === statType)?.icon ?? Trophy;

  return (
    <AppLayout title="Leaderboard">
      <div className="space-y-3 pb-4">

        {/* ── Hero game banner ── */}
        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent rounded-2xl px-4 py-3 flex items-center gap-2.5 border border-primary/20">
          <Gamepad2 className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Showing Leaderboard For</p>
            <p className="text-sm font-bold text-foreground truncate">{game}</p>
          </div>
          {userGame && game !== userGame && (
            <button
              onClick={() => setGame(userGame)}
              className="text-[10px] text-primary border border-primary/30 bg-primary/10 rounded-full px-2.5 py-1 font-semibold hover:bg-primary/20 transition-colors shrink-0"
            >
              My Game
            </button>
          )}
        </div>

        {/* ── Filters row ── */}
        <div className="grid grid-cols-3 gap-2">
          {/* Timeframe */}
          <div className="col-span-1">
            <div className="flex bg-secondary rounded-lg p-0.5 h-9">
              <button
                onClick={() => setTimeframe("all")}
                className={`flex-1 rounded-md text-[11px] font-medium transition-all ${timeframe === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                All Time
              </button>
              <button
                onClick={() => setTimeframe("week")}
                className={`flex-1 rounded-md text-[11px] font-medium transition-all ${timeframe === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Week
              </button>
            </div>
          </div>

          {/* Game filter */}
          <Select value={game} onValueChange={setGame}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAMES.map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stats filter */}
          <Select value={statType} onValueChange={setStatType}>
            <SelectTrigger className="h-9 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <StatIcon className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span className="truncate">{STAT_OPTIONS.find(s => s.value === statType)?.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {STAT_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  <div className="flex items-center gap-2">
                    <s.icon className="w-3.5 h-3.5 text-primary" />
                    {s.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── List ── */}
        <LeaderboardList
          data={data}
          type={statType}
          isLoading={isLoading}
          currentUserId={user?.id}
        />
      </div>
    </AppLayout>
  );
}
