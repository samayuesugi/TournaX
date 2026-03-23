import { useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { useExploreUsers } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserProfile } from "@workspace/api-client-react";

function UserCard({ profile }: { profile: UserProfile }) {
  const inner = (
    <div className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:border-primary/30 transition-all cursor-pointer">
      {profile.avatar?.startsWith("/objects/") ? (
        <img src={`/api/storage${profile.avatar}`} alt="avatar" className="w-11 h-11 rounded-xl object-cover bg-secondary shrink-0" />
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
      {profile.rating && (
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-accent">{profile.rating.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">rating</div>
        </div>
      )}
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
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <Tabs defaultValue="hosts">
            <TabsList className="w-full">
              <TabsTrigger value="hosts" className="flex-1">Top Hosts</TabsTrigger>
              <TabsTrigger value="players" className="flex-1">Top Players</TabsTrigger>
            </TabsList>

            <TabsContent value="hosts">
              {data?.recommendedHosts.length ? (
                <div className="space-y-2 mt-3">
                  {data.recommendedHosts.map((h) => <UserCard key={h.id} profile={h} />)}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">No hosts found</div>
              )}
            </TabsContent>

            <TabsContent value="players">
              {data?.mostActivePlayers.length ? (
                <div className="space-y-2 mt-3">
                  {data.mostActivePlayers.map((p) => <UserCard key={p.id} profile={p} />)}
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
