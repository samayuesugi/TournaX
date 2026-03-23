import { useState } from "react";
import { Link } from "wouter";
import { Search, Star, Swords, UserCheck, Shield } from "lucide-react";
import { useExploreUsers } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@workspace/api-client-react";

function Avatar({ profile, size = "md" }: { profile: UserProfile; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-14 h-14 text-2xl" : size === "md" ? "w-12 h-12 text-xl" : "w-9 h-9 text-base";
  const rnd = size === "lg" ? "rounded-2xl" : "rounded-xl";
  if (profile.avatar?.startsWith("/") || profile.avatar?.startsWith("http")) {
    return (
      <img
        src={profile.avatar.startsWith("/objects/") ? `/api/storage${profile.avatar}` : profile.avatar}
        alt="avatar"
        className={cn(sz, rnd, "object-cover bg-secondary shrink-0")}
      />
    );
  }
  return (
    <div className={cn(sz, rnd, "bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0")}>
      {profile.avatar || "🎮"}
    </div>
  );
}

function HostCard({ profile }: { profile: UserProfile }) {
  const isAdmin = profile.role === "admin";

  const inner = (
    <div className={cn(
      "rounded-2xl border overflow-hidden transition-all cursor-pointer active:scale-[0.99] hover:shadow-md hover:shadow-black/20",
      isAdmin ? "border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-card" : "border-blue-500/25 bg-gradient-to-br from-blue-500/5 to-card"
    )}>
      {/* Top section */}
      <div className="flex items-center gap-3 p-4">
        <Avatar profile={profile} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-bold text-sm text-foreground truncate">{profile.name || `@${profile.handle}`}</span>
            {isAdmin ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30 flex items-center gap-0.5">
                <Shield className="w-2.5 h-2.5" /> Admin
              </span>
            ) : (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
                Host
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">@{profile.handle || "no handle"}</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
        <div className="flex items-center justify-center gap-1.5 py-2.5">
          <UserCheck className={cn("w-3.5 h-3.5", isAdmin ? "text-orange-400" : "text-blue-400")} />
          <span className="text-xs font-bold text-foreground">{profile.followersCount}</span>
          <span className="text-[10px] text-muted-foreground">followers</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 py-2.5">
          <Swords className={cn("w-3.5 h-3.5", isAdmin ? "text-orange-400" : "text-blue-400")} />
          <span className="text-xs font-bold text-foreground">{profile.matchesCount}</span>
          <span className="text-[10px] text-muted-foreground">matches</span>
        </div>
      </div>
    </div>
  );

  if (!profile.handle) return inner;
  return <Link href={`/profile/${profile.handle}`}>{inner}</Link>;
}

function PlayerCard({ profile, rank }: { profile: UserProfile; rank: number }) {
  const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];
  const rankBg = ["bg-yellow-500/10 border-yellow-500/25", "bg-slate-500/10 border-slate-500/25", "bg-amber-600/10 border-amber-600/25"];
  const isTop3 = rank <= 3;

  const inner = (
    <div className={cn(
      "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all cursor-pointer active:scale-[0.99] hover:shadow-md hover:shadow-black/20",
      isTop3 ? rankBg[rank - 1] : "bg-card border-card-border hover:border-primary/25"
    )}>
      {/* Rank badge */}
      <div className={cn(
        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm",
        isTop3 ? cn("bg-background/50", rankColors[rank - 1]) : "bg-secondary text-muted-foreground"
      )}>
        {isTop3 ? (
          <Star className={cn("w-4 h-4", rankColors[rank - 1])} fill="currentColor" />
        ) : (
          `#${rank}`
        )}
      </div>

      <Avatar profile={profile} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-foreground truncate">{profile.name || `@${profile.handle}`}</div>
        <div className="text-xs text-muted-foreground">@{profile.handle || "unknown"}</div>
      </div>

      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 justify-end">
          <Swords className="w-3 h-3 text-primary" />
          <span className="text-sm font-bold text-primary">{profile.matchesCount}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">matches</div>
      </div>
    </div>
  );

  if (!profile.handle) return inner;
  return <Link href={`/profile/${profile.handle}`}>{inner}</Link>;
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

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : (
          <Tabs defaultValue="hosts">
            <TabsList className="w-full">
              <TabsTrigger value="hosts" className="flex-1">Top Hosts</TabsTrigger>
              <TabsTrigger value="players" className="flex-1">Top Players</TabsTrigger>
            </TabsList>

            <TabsContent value="hosts">
              {data?.recommendedHosts.length ? (
                <div className="space-y-2.5 mt-3">
                  {data.recommendedHosts.map((h) => <HostCard key={h.id} profile={h} />)}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">No hosts found</div>
              )}
            </TabsContent>

            <TabsContent value="players">
              {data?.mostActivePlayers.length ? (
                <div className="space-y-2 mt-3">
                  {data.mostActivePlayers.map((p, i) => (
                    <PlayerCard key={p.id} profile={p} rank={i + 1} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">No players found</div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
