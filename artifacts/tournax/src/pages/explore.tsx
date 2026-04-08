import { useState } from "react";
import { Link } from "wouter";
import { Search, Lock, UserPlus, UserCheck, Share2, Image, Film, FileText, X } from "lucide-react";
import { useExploreUsers, customFetch, useFollowUser, useUnfollowUser } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/useAuth";
import { useToast } from "@/hooks/use-toast";
import { PostsFeed } from "@/components/posts/PostsFeed";
import { ShieldCheck, Star } from "lucide-react";

function UserRecommendCard({ profile }: { profile: UserProfile }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [following, setFollowing] = useState(profile.isFollowing ?? false);
  const { mutateAsync: follow, isPending: isFollowing } = useFollowUser();
  const { mutateAsync: unfollow, isPending: isUnfollowing } = useUnfollowUser();

  const isSelf = user?.id === profile.id;

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) {
        await unfollow({ handle: profile.handle! });
      } else {
        await follow({ handle: profile.handle! });
      }
      queryClient.invalidateQueries({ queryKey: ["exploreUsers"] });
    } catch {
      setFollowing(wasFollowing);
      toast({ title: "Action failed", description: "Could not update follow status. Please try again.", variant: "destructive" });
    }
  };

  const card = (
    <div className="flex items-center gap-3 bg-card border border-primary/20 rounded-2xl px-4 py-3 hover:border-primary/40 transition-all cursor-pointer">
      {(profile.avatar?.startsWith("/") || profile.avatar?.startsWith("http")) ? (
        <img src={profile.avatar.startsWith("/objects/") ? `/api/storage${profile.avatar}` : profile.avatar} alt="avatar" className="w-12 h-12 rounded-2xl object-cover bg-secondary shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-2xl shrink-0">
          {profile.avatar || "🎮"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-bold text-sm truncate">{profile.name || `@${profile.handle}`}</span>
          {(profile.role === "host" || profile.role === "admin") && (
            <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${profile.role === "admin" ? "text-primary" : "text-orange-400"}`} />
          )}
        </div>
        <div className="text-xs text-muted-foreground">@{profile.handle || "no handle"}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{profile.followersCount} followers</span>
          {profile.matchesCount ? <span>· {profile.matchesCount} matches</span> : null}
          {profile.rating && <span className="flex items-center gap-0.5 text-yellow-400"><Star className="w-3 h-3 fill-yellow-400" />{profile.rating.toFixed(1)}</span>}
        </div>
      </div>
      {user && !isSelf && profile.handle && (
        <Button
          size="sm"
          variant={following ? "secondary" : "default"}
          className="h-7 px-2.5 text-xs gap-1 shrink-0"
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
  );

  if (!profile.handle) return card;
  return <Link href={`/profile/${profile.handle}`}>{card}</Link>;
}

function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border-t border-border rounded-t-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Share</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 pb-8">
          <p className="text-xs text-muted-foreground">Choose what you want to share</p>

          <div className="grid grid-cols-3 gap-3">
            <button
              className="relative flex flex-col items-center gap-2 bg-secondary/60 border border-border rounded-2xl px-3 py-5 opacity-60 cursor-not-allowed"
              disabled
            >
              <div className="absolute -top-1.5 -right-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full p-0.5">
                <Lock className="w-3 h-3 text-yellow-400" />
              </div>
              <Image className="w-7 h-7 text-primary" />
              <span className="text-xs font-semibold">Images</span>
              <span className="text-[10px] text-muted-foreground">Coming Soon</span>
            </button>

            <button
              className="relative flex flex-col items-center gap-2 bg-secondary/60 border border-border rounded-2xl px-3 py-5 opacity-60 cursor-not-allowed"
              disabled
            >
              <div className="absolute -top-1.5 -right-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full p-0.5">
                <Lock className="w-3 h-3 text-yellow-400" />
              </div>
              <Film className="w-7 h-7 text-primary" />
              <span className="text-xs font-semibold">Clips</span>
              <span className="text-[10px] text-muted-foreground">Coming Soon</span>
            </button>

            <button
              className="relative flex flex-col items-center gap-2 bg-secondary/60 border border-border rounded-2xl px-3 py-5 opacity-60 cursor-not-allowed"
              disabled
            >
              <div className="absolute -top-1.5 -right-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full p-0.5">
                <Lock className="w-3 h-3 text-yellow-400" />
              </div>
              <FileText className="w-7 h-7 text-primary" />
              <span className="text-xs font-semibold">Post</span>
              <span className="text-[10px] text-muted-foreground">Coming Soon</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiscoveryPage() {
  const [search, setSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const { data, isLoading } = useExploreUsers(
    { search: search || undefined },
    { query: { staleTime: 30000 } as any }
  );

  const recommendedHosts = data?.recommendedHosts ?? [];

  return (
    <AppLayout title="Explore">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search players, hosts..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShareOpen(true)}
            className="relative flex items-center gap-1.5 px-3 h-10 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
            <Lock className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-yellow-400" />
          </button>
        </div>

        {search ? (
          <div className="space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : (recommendedHosts.length > 0 || (data?.mostActivePlayers ?? []).length > 0) ? (
              <div className="flex flex-col gap-2">
                {recommendedHosts.map(h => <UserRecommendCard key={h.id} profile={h} />)}
                {(data?.mostActivePlayers ?? []).map(p => <UserRecommendCard key={p.id} profile={p} />)}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">No results found</div>
            )}
          </div>
        ) : (
          <PostsFeed recommendedHosts={recommendedHosts} isLoadingHosts={isLoading} />
        )}
      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
    </AppLayout>
  );
}
