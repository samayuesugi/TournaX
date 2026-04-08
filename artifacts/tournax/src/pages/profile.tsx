import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetUserProfile, useFollowUser, useUnfollowUser,
  useGetMySquad, useUpdateMyProfile,
  useGetMyMatches, customFetch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin } from "@/components/ui/Coins";
import { MatchCard } from "@/components/match/MatchCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Star, Swords, Settings, Plus, Trash2, MessageCircle, Crown, ShieldCheck, Pencil, Grid3X3, Shield, BarChart2, ChevronRight, Lock, Search, X, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOST_AVATARS, isImageAvatar, resolveAvatarSrc } from "@/lib/host-avatars";
import { getFrameClass, getBadgeEmoji, getHandleColorClass } from "@/lib/cosmetics";
import { PostCard, type Post } from "@/components/posts/PostsFeed";

function canChat(senderRole: string, recipientRole: string): boolean {
  if (senderRole === "player" && recipientRole === "admin") return false;
  return true;
}

const PLAYER_AVATARS = ["🎮", "🏆", "⚔️", "🔥", "💀", "👑", "🎯", "🦾", "🤑", "😴", "🧔", "👩‍🦰", "🐲", "⚡️", "🗿", "💎"];

const PROFILE_ANIMATIONS = [
  { value: "", label: "None" },
  { value: "pulse", label: "Pulse Glow" },
  { value: "neon", label: "Neon Flow" },
  { value: "shimmer", label: "Shimmer" },
];

const PROFILE_COLORS = [
  { value: "", label: "Default", hex: "#8b5cf6" },
  { value: "blue", label: "Blue", hex: "#3b82f6" },
  { value: "red", label: "Red", hex: "#ef4444" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "green", label: "Green", hex: "#22c55e" },
  { value: "gold", label: "Gold", hex: "#eab308" },
  { value: "pink", label: "Pink", hex: "#ec4899" },
  { value: "cyan", label: "Cyan", hex: "#06b6d4" },
];

const SQUAD_ROLES = ["Rusher", "Sniper", "IGL", "Support", "Leader", "All-Rounder"];

const GAME_STATS_FIELDS: Record<string, { key: string; label: string; type: "text" | "number" | "percent" }[]> = {
  "Free Fire": [
    { key: "brRank", label: "BR Rank", type: "text" },
    { key: "csRank", label: "CS Rank", type: "text" },
    { key: "kd", label: "K/D Ratio", type: "number" },
    { key: "headshotPct", label: "Headshot %", type: "percent" },
    { key: "totalMatches", label: "Total Matches", type: "number" },
    { key: "totalWins", label: "Total Wins (Booyahs)", type: "number" },
    { key: "totalKills", label: "Total Kills", type: "number" },
    { key: "winRate", label: "Win Rate %", type: "percent" },
  ],
  "BGMI": [
    { key: "classicTier", label: "Classic Tier", type: "text" },
    { key: "arenaTier", label: "Arena Tier", type: "text" },
    { key: "kd", label: "K/D Ratio", type: "number" },
    { key: "headshotPct", label: "Headshot %", type: "percent" },
    { key: "totalMatches", label: "Total Matches", type: "number" },
    { key: "totalWins", label: "Total Wins (Chickens)", type: "number" },
    { key: "totalDamage", label: "Total Damage", type: "number" },
    { key: "winRate", label: "Win Rate %", type: "percent" },
  ],
  "COD Mobile": [
    { key: "rankedTier", label: "Ranked Tier", type: "text" },
    { key: "kd", label: "K/D Ratio", type: "number" },
    { key: "winRate", label: "Win Rate %", type: "percent" },
    { key: "totalMatches", label: "Total Matches", type: "number" },
    { key: "totalKills", label: "Total Kills", type: "number" },
  ],
  "Valorant": [
    { key: "rank", label: "Rank", type: "text" },
    { key: "kd", label: "K/D Ratio", type: "number" },
    { key: "winRate", label: "Win Rate %", type: "percent" },
    { key: "headshotPct", label: "Headshot %", type: "percent" },
    { key: "totalMatches", label: "Total Matches", type: "number" },
  ],
  "PUBG PC": [
    { key: "tier", label: "Tier/Rank", type: "text" },
    { key: "kd", label: "K/D Ratio", type: "number" },
    { key: "winRate", label: "Win Rate %", type: "percent" },
    { key: "totalMatches", label: "Total Matches", type: "number" },
    { key: "totalWins", label: "Total Wins", type: "number" },
  ],
};

export function AvatarDisplay({
  avatar,
  className = "w-16 h-16 rounded-2xl text-3xl",
}: {
  avatar?: string | null;
  className?: string;
}) {
  if (isImageAvatar(avatar)) {
    return <img src={resolveAvatarSrc(avatar!)} alt="avatar" className={`${className} object-cover bg-secondary`} />;
  }
  return <div className={`${className} bg-primary/20 flex items-center justify-center`}>{avatar || "🎮"}</div>;
}

function getBannerGradient(color: string | null | undefined, animation: string | null | undefined) {
  const c = color || "";
  const gradients: Record<string, string> = {
    blue: "linear-gradient(135deg, #1e3a8a, #1d4ed8, #3b82f6, #1e3a8a)",
    red: "linear-gradient(135deg, #7f1d1d, #dc2626, #ef4444, #7f1d1d)",
    orange: "linear-gradient(135deg, #7c2d12, #ea580c, #f97316, #7c2d12)",
    green: "linear-gradient(135deg, #14532d, #16a34a, #22c55e, #14532d)",
    gold: "linear-gradient(135deg, #713f12, #ca8a04, #eab308, #713f12)",
    pink: "linear-gradient(135deg, #831843, #db2777, #ec4899, #831843)",
    cyan: "linear-gradient(135deg, #164e63, #0891b2, #06b6d4, #164e63)",
    purple: "linear-gradient(135deg, #3b0764, #7c3aed, #8b5cf6, #3b0764)",
  };
  if (c && gradients[c]) return gradients[c];
  if (animation) return "linear-gradient(135deg, #1e1030, #3b0764, #7c3aed, #1e1030)";
  return "transparent";
}

const SocialIcons = {
  Instagram: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  Discord: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.079.11 18.1.128 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  ),
  X: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
};

function extractHandle(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    return parts[parts.length - 1] || value;
  } catch {
    return value.replace(/^@/, "").trim();
  }
}

function SocialLinksDisplay({ instagram, discord, x, youtube }: {
  instagram?: string | null; discord?: string | null; x?: string | null; youtube?: string | null;
}) {
  const links = [
    { key: "Instagram" as const, value: instagram, href: (v: string) => `https://instagram.com/${extractHandle(v)}`, color: "text-pink-400 hover:text-pink-300", bg: "bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/20" },
    { key: "Discord" as const, value: discord, href: (v: string) => `https://discord.com/users/${extractHandle(v)}`, color: "text-indigo-400 hover:text-indigo-300", bg: "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20" },
    { key: "X" as const, value: x, href: (v: string) => `https://x.com/${extractHandle(v)}`, color: "text-sky-400 hover:text-sky-300", bg: "bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20" },
    { key: "YouTube" as const, value: youtube, href: (v: string) => `https://youtube.com/@${extractHandle(v)}`, color: "text-red-400 hover:text-red-300", bg: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20" },
  ].filter(l => l.value);
  if (!links.length) return null;
  return (
    <div className="flex gap-2">
      {links.map(({ key, value, href, color, bg }) => (
        <a key={key} href={href(value!)} target="_blank" rel="noopener noreferrer"
          className={cn("inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all", bg, color)}>
          {SocialIcons[key]}
        </a>
      ))}
    </div>
  );
}

function FollowersModal({ handle, count, type, open, onClose }: { handle: string; count: number; type: "followers" | "following"; open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<{ id: number; name: string | null; handle: string | null; avatar: string; role: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!open || !handle) return;
    setLoading(true);
    customFetch<typeof users>(`/api/users/${handle}/${type}`)
      .then(setUsers).catch(() => setUsers([])).finally(() => setLoading(false));
  }, [open, handle, type]);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{type === "followers" ? `Followers (${count})` : `Following (${count})`}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-1 px-1">
          {loading ? (
            <div className="space-y-3 pt-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{type === "followers" ? "No followers yet" : "Not following anyone yet"}</p>
          ) : (
            <div className="space-y-1 pt-1">
              {users.map(f => (
                <button key={f.id} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary/60 transition-colors text-left"
                  onClick={() => { onClose(); navigate(`/profile/${f.handle}`); }}>
                  <AvatarDisplay avatar={f.avatar} className="w-10 h-10 rounded-xl text-lg shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{f.name || `@${f.handle}`}</p>
                    <p className="text-xs text-muted-foreground truncate">@{f.handle}</p>
                  </div>
                  {(f.role === "host" || f.role === "admin") && (
                    <div className="ml-auto shrink-0 flex items-center gap-1">
                      <ShieldCheck className={`w-3.5 h-3.5 ${f.role === "admin" ? "text-primary" : "text-orange-400"}`} />
                      <span className={`text-[10px] font-semibold uppercase ${f.role === "admin" ? "text-primary" : "text-orange-400"}`}>{f.role === "admin" ? "Admin" : "Host"}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StarRating({ value, onChange, size = 6 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" disabled={!onChange}
          onClick={() => onChange?.(i)}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => setHover(0)}
          className={cn("transition-colors", onChange ? "cursor-pointer" : "cursor-default")}>
          <Star className={cn(`w-${size} h-${size}`, (hover || value) >= i ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")} />
        </button>
      ))}
    </div>
  );
}

function RateHostDialog({ hostHandle, hostName, matchId, open, onClose }: { hostHandle: string; hostName: string; matchId?: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    if (!rating) { toast({ title: "Please select a rating", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await customFetch(`/api/users/${hostHandle}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment: comment.trim() || null, matchId }) });
      toast({ title: "Review submitted!", description: "Thank you for your feedback." });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Could not submit review", variant: "destructive" });
    } finally { setSubmitting(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Rate {hostName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-2">
            <StarRating value={rating} onChange={setRating} size={8} />
            <p className="text-xs text-muted-foreground">{rating === 0 ? "Tap to rate" : rating === 1 ? "Poor" : rating === 2 ? "Fair" : rating === 3 ? "Good" : rating === 4 ? "Great" : "Excellent!"}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Your Opinion <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea placeholder="Share your experience with this host..." value={comment} onChange={e => setComment(e.target.value)} rows={3} className="resize-none" maxLength={300} />
            <p className="text-[10px] text-muted-foreground text-right">{comment.length}/300</p>
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={submitting || !rating}>
            {submitting ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HostRatingsSection({ handle }: { handle: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["hostReviews", handle],
    queryFn: () => customFetch<{ reviews: any[]; avgRating: number | null; count: number }>(`/api/users/${handle}/reviews`),
  });
  if (isLoading) return <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;
  if (!data?.reviews.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No ratings yet</p>
    </div>
  );
  return (
    <div className="space-y-3 p-4">
      {data.avgRating !== null && (
        <div className="bg-card border border-card-border rounded-2xl p-4 flex items-center gap-4">
          <div className="text-center">
            <div className="text-4xl font-black text-yellow-400">{data.avgRating.toFixed(1)}</div>
            <StarRating value={Math.round(data.avgRating)} size={4} />
            <div className="text-[10px] text-muted-foreground mt-1">{data.count} review{data.count !== 1 ? "s" : ""}</div>
          </div>
          <div className="flex-1">
            {[5, 4, 3, 2, 1].map(star => {
              const count = data.reviews.filter(r => r.rating === star).length;
              const pct = data.count > 0 ? (count / data.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground w-4">{star}</span>
                  <div className="flex-1 bg-secondary rounded-full h-1.5">
                    <div className="bg-yellow-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data.reviews.map(review => (
        <div key={review.id} className="bg-card border border-card-border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-sm shrink-0">
              {review.reviewerAvatar || "🎮"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{review.reviewerName || `@${review.reviewerHandle}`}</div>
              <div className="text-xs text-muted-foreground">@{review.reviewerHandle}</div>
            </div>
            <StarRating value={review.rating} size={3} />
          </div>
          {review.comment && <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>}
          <div className="text-[10px] text-muted-foreground mt-1.5">{new Date(review.createdAt).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  );
}

function PostGrid({ userId, isOwn }: { userId: number; isOwn: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  useEffect(() => {
    customFetch<Post[]>(`/api/posts?userId=${userId}&limit=30`)
      .then(setPosts).catch(() => setPosts([])).finally(() => setLoading(false));
  }, [userId]);
  if (loading) return <div className="grid grid-cols-3 gap-0.5 p-0.5">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="aspect-square" />)}</div>;
  if (!posts.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Grid3X3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{isOwn ? "No posts yet. Share your clips!" : "No posts yet"}</p>
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-3 gap-0.5">
        {posts.map(post => (
          <button key={post.id} onClick={() => setSelectedPost(post)} className="aspect-square overflow-hidden bg-secondary relative group">
            {post.imageUrl?.startsWith("/objects/") || post.imageUrl?.startsWith("http") ? (
              <img src={post.imageUrl.startsWith("/objects/") ? `/api/storage${post.imageUrl}` : post.imageUrl} alt="" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center text-3xl">{post.imageUrl || "📷"}</div>
            )}
          </button>
        ))}
      </div>
      {selectedPost && (
        <Dialog open onOpenChange={() => setSelectedPost(null)}>
          <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
            <PostCard post={selectedPost} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function PlayerMatchHistory({ userId }: { userId: number }) {
  const { data: matches, isLoading } = useQuery({
    queryKey: ["playerMatches", userId],
    queryFn: () => customFetch<any[]>(`/api/players/${userId}/matches`),
  });
  if (isLoading) return <div className="space-y-2 p-4">{[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  const list = matches ?? [];
  if (!list.length) return (
    <div className="text-center py-12 text-muted-foreground p-4">
      <Swords className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No match history</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 p-4">
      {list.map(m => <MatchCard key={m.id} match={m} />)}
    </div>
  );
}

function EsportsStatsDisplay({ handle, game }: { handle: string; game: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["esportsStats", handle],
    queryFn: () => customFetch<{ game: string; stats: Record<string, string> }[]>(`/api/users/${handle}/esports-stats`),
  });
  if (isLoading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>;
  const allStats = data ?? [];
  if (!allStats.length) return (
    <div className="text-center py-12 text-muted-foreground p-4">
      <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No Esports stats added yet</p>
    </div>
  );
  return (
    <div className="space-y-4 p-4">
      {allStats.map(({ game: g, stats }) => {
        const fields = GAME_STATS_FIELDS[g] ?? [];
        const filledFields = fields.filter(f => stats[f.key]);
        if (!filledFields.length) return null;
        return (
          <div key={g} className="bg-card border border-card-border rounded-2xl overflow-hidden">
            <div className="bg-primary/10 px-4 py-2.5 flex items-center gap-2">
              <span className="text-sm">🎮</span>
              <span className="text-sm font-bold text-primary">{g}</span>
              <span className="text-xs text-muted-foreground ml-auto">Esports Stats</span>
            </div>
            <div className="grid grid-cols-2 gap-0">
              {filledFields.map((field, idx) => (
                <div key={field.key} className={cn("px-4 py-3 border-b border-card-border", idx % 2 === 0 ? "border-r" : "")}>
                  <div className="text-xs text-muted-foreground">{field.label}</div>
                  <div className="font-bold text-sm text-foreground mt-0.5">
                    {stats[field.key]}{field.type === "percent" ? "%" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EsportsStatsEditor({ userGame }: { userGame: string | null }) {
  const { toast } = useToast();
  const [selectedGame, setSelectedGame] = useState(userGame || Object.keys(GAME_STATS_FIELDS)[0]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fields = GAME_STATS_FIELDS[selectedGame] ?? [];
  const { data: existing } = useQuery({
    queryKey: ["myEsportsStats"],
    queryFn: () => customFetch<{ game: string; stats: Record<string, string> }[]>("/api/users/me/esports-stats"),
  });
  const qc = useQueryClient();
  useEffect(() => {
    const found = existing?.find(s => s.game === selectedGame);
    setForm(found?.stats as Record<string, string> ?? {});
  }, [selectedGame, existing]);
  const handleSave = async () => {
    setSaving(true);
    try {
      await customFetch("/api/users/me/esports-stats", { method: "PUT", body: JSON.stringify({ game: selectedGame, stats: form }) });
      qc.invalidateQueries({ queryKey: ["myEsportsStats"] });
      toast({ title: "Stats saved!" });
    } catch {
      toast({ title: "Failed to save stats", variant: "destructive" });
    } finally { setSaving(false); }
  };
  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {Object.keys(GAME_STATS_FIELDS).map(g => (
          <button key={g} onClick={() => setSelectedGame(g)}
            className={cn("shrink-0 text-xs px-3 py-1.5 rounded-full border transition-all", selectedGame === g ? "border-primary bg-primary/20 text-primary font-semibold" : "border-border bg-secondary/50 text-muted-foreground")}>
            {g}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(field => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs">{field.label}</Label>
            <Input value={form[field.key] ?? ""} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
              placeholder={field.type === "number" ? "0" : field.type === "percent" ? "0.00" : "—"}
              className="h-9 text-sm" />
          </div>
        ))}
      </div>
      <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Stats"}</Button>
    </div>
  );
}

function SquadSection({ userId, isOwn, userGame, isEsports }: { userId: number; isOwn: boolean; userGame: string | null; isEsports: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: squad, refetch: refetchSquad } = useGetMySquad();
  const SQUAD_GAMES = ["BGMI", "Free Fire", "PUBG Mobile", "Call of Duty Mobile", "Valorant Mobile"];
  const [squadGame, setSquadGame] = useState<string>(userGame ?? SQUAD_GAMES[0]);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [role, setRole] = useState("");
  const [isBackup, setIsBackup] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<any>(null);

  const filteredSquad = (squad ?? []).filter((m: any) => m.game === squadGame);
  const mainMembers = filteredSquad.filter((m: any) => !m.isBackup);
  const backupMembers = filteredSquad.filter((m: any) => m.isBackup);

  const handleSearch = (q: string) => {
    setSearchQ(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await customFetch<any[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.filter((u: any) => u.role === "player"));
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 400);
  };

  const handleAddMember = async () => {
    if (!selectedPlayer?.handle) {
      toast({ title: "Player must have a valid handle", variant: "destructive" });
      return;
    }
    try {
      await customFetch(`/api/users/${selectedPlayer.handle}/squad-request`, {
        method: "POST",
        body: JSON.stringify({ game: squadGame, role: role || null, isBackup }),
      });
      setAddOpen(false);
      setSelectedPlayer(null);
      setSearchQ(""); setRole(""); setIsBackup(false);
      toast({ title: "Squad invite sent!", description: `${selectedPlayer.name || selectedPlayer.handle} will receive an invite notification.` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleDelete = async (memberId: number) => {
    try {
      await customFetch(`/api/users/me/squad/${memberId}`, { method: "DELETE" });
      refetchSquad();
      toast({ title: "Member removed" });
    } catch { toast({ title: "Failed to remove member", variant: "destructive" }); }
  };

  const [memberStatsOpen, setMemberStatsOpen] = useState<any>(null);

  const renderMember = (m: any) => (
    <div key={m.id} className="flex items-center gap-2.5 bg-secondary/40 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-secondary/60 transition-colors" onClick={() => m.linkedHandle && setMemberStatsOpen(m)}>
      <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-base shrink-0 overflow-hidden">
        {m.linkedAvatar ? (
          isImageAvatar(m.linkedAvatar) ? <img src={resolveAvatarSrc(m.linkedAvatar)} alt="" className="w-full h-full object-cover" /> : m.linkedAvatar
        ) : "🎮"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{m.name}</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {m.linkedHandle && <span className="text-[10px] text-primary">@{m.linkedHandle}</span>}
          {m.role && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{m.role}</span>}
          {m.isBackup && <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">Backup</span>}
          <span className="text-[10px] text-muted-foreground font-mono">{m.uid}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {m.linkedHandle && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        {isOwn && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  const publicSquadQuery = useQuery({
    queryKey: ["publicSquad", userId],
    queryFn: () => customFetch<any[]>(`/api/users/${userId}/squad`).catch(() => []),
    enabled: !isOwn,
  });

  const displaySquad = isOwn ? squad ?? [] : publicSquadQuery.data ?? [];
  const displayFiltered = displaySquad.filter((m: any) => m.game === squadGame);
  const displayMain = displayFiltered.filter((m: any) => !m.isBackup);
  const displayBackup = displayFiltered.filter((m: any) => m.isBackup);

  return (
    <div className="pb-4">
      <div className="flex gap-1.5 overflow-x-auto pb-2 px-4 pt-4" style={{ scrollbarWidth: "none" }}>
        {SQUAD_GAMES.map(g => (
          <button key={g} onClick={() => setSquadGame(g)}
            className={cn("shrink-0 text-xs px-2.5 py-1 rounded-full border transition-all", squadGame === g ? "border-primary bg-primary/20 text-primary font-semibold" : "border-border bg-secondary/50 text-muted-foreground")}>
            {g}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {displayMain.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Main ({displayMain.length}/4)</span>
              {isOwn && displayMain.length < 4 && (
                <button onClick={() => { setIsBackup(false); setAddOpen(true); }} className="text-xs text-primary flex items-center gap-1 hover:opacity-80">
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            <div className="space-y-2">{displayMain.map(renderMember)}</div>
          </div>
        )}

        {displayMain.length === 0 && isOwn && (
          <div className="text-center py-6">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground mb-3">No squad members for {squadGame}</p>
            <Button size="sm" variant="outline" onClick={() => { setIsBackup(false); setAddOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Member
            </Button>
          </div>
        )}

        {displayMain.length === 0 && !isOwn && (
          <div className="text-center py-6">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">No squad for {squadGame}</p>
          </div>
        )}

        {(displayBackup.length > 0 || (isOwn && displayBackup.length < 2 && displayMain.length > 0)) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Backups ({displayBackup.length}/2)</span>
              {isOwn && displayBackup.length < 2 && (
                <button onClick={() => { setIsBackup(true); setAddOpen(true); }} className="text-xs text-orange-400 flex items-center gap-1 hover:opacity-80">
                  <Plus className="w-3 h-3" /> Add Backup
                </button>
              )}
            </div>
            {displayBackup.length > 0 && <div className="space-y-2">{displayBackup.map(renderMember)}</div>}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add {isBackup ? "Backup" : "Squad"} Member — {squadGame}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4">
            <div className="space-y-2">
              <Label>Search Player by Handle</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search handle or name..." value={searchQ} onChange={e => handleSearch(e.target.value)} />
              </div>
              {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
              {searchResults.length > 0 && !selectedPlayer && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {searchResults.slice(0, 5).map(u => (
                    <button key={u.id} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-secondary/60 transition-colors border-b last:border-b-0 border-border"
                      onClick={() => { setSelectedPlayer(u); setSearchQ(u.name || u.handle); setSearchResults([]); }}>
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-sm shrink-0">{u.avatar || "🎮"}</div>
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        <div className="text-xs text-muted-foreground">@{u.handle}</div>
                      </div>
                      <UserPlus className="w-4 h-4 text-primary ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {selectedPlayer && (
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-sm shrink-0">{selectedPlayer.avatar || "🎮"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{selectedPlayer.name}</div>
                    <div className="text-xs text-muted-foreground">@{selectedPlayer.handle}</div>
                  </div>
                  <button onClick={() => { setSelectedPlayer(null); setSearchQ(""); }}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {SQUAD_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="shrink-0 space-y-2 mt-4">
            <p className="text-xs text-muted-foreground text-center">Player must have an in-app account. They'll receive an invite notification.</p>
            <Button className="w-full" onClick={handleAddMember} disabled={!selectedPlayer}>Send Squad Invite</Button>
          </div>
        </DialogContent>
      </Dialog>

      {memberStatsOpen && (
        <Dialog open={!!memberStatsOpen} onOpenChange={() => setMemberStatsOpen(null)}>
          <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <AvatarDisplay avatar={memberStatsOpen.linkedAvatar} className="w-8 h-8 rounded-lg text-base" />
                <div>
                  <div>{memberStatsOpen.name}</div>
                  {memberStatsOpen.linkedHandle && <div className="text-xs text-primary font-normal">@{memberStatsOpen.linkedHandle}</div>}
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1">
              <EsportsStatsDisplay handle={memberStatsOpen.linkedHandle} game={null} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function EditProfileDialog({ open, onClose, user, refreshUser }: { open: boolean; onClose: () => void; user: any; refreshUser: () => Promise<void> }) {
  const { toast } = useToast();
  const { mutateAsync: updateProfile, isPending } = useUpdateMyProfile();
  const [availableGames, setAvailableGames] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    handle: user?.handle ?? "",
    avatar: user?.avatar ?? "🎮",
    bio: (user as any)?.bio ?? "",
    instagram: user?.instagram ?? "",
    discord: user?.discord ?? "",
    x: user?.x ?? "",
    youtube: user?.youtube ?? "",
    game: (user as any)?.game ?? "",
    gameUid: (user as any)?.gameUid ?? "",
    profileAnimation: (user as any)?.profileAnimation ?? "",
    profileColor: (user as any)?.profileColor ?? "",
  });
  useEffect(() => {
    if (open) {
      setForm({
        name: user?.name ?? "",
        handle: user?.handle ?? "",
        avatar: user?.avatar ?? "🎮",
        bio: (user as any)?.bio ?? "",
        instagram: user?.instagram ?? "",
        discord: user?.discord ?? "",
        x: user?.x ?? "",
        youtube: user?.youtube ?? "",
        game: (user as any)?.game ?? "",
        gameUid: (user as any)?.gameUid ?? "",
        profileAnimation: (user as any)?.profileAnimation ?? "",
        profileColor: (user as any)?.profileColor ?? "",
      });
      if (user?.role === "player" && availableGames.length === 0) {
        customFetch<{ id: number; name: string }[]>("/api/games").then(setAvailableGames).catch(() => {});
      }
    }
  }, [open]);
  const handleSave = async () => {
    try {
      await updateProfile({ data: form as any });
      await refreshUser();
      toast({ title: "Profile updated!" });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };
  const isHost = user?.role === "host" || user?.role === "admin";
  const isPlayer = user?.role === "player";
  const isEsports = isPlayer && (user as any)?.isEsportsPlayer;
  const gameAvatars = isHost && user?.game ? HOST_AVATARS[user.game] : null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0"><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="space-y-2">
            <Label>Avatar</Label>
            {gameAvatars ? (
              <div className={`grid gap-2 ${gameAvatars.length >= 5 ? "grid-cols-5" : "grid-cols-4"}`}>
                {gameAvatars.map((src: string) => (
                  <button key={src} type="button" onClick={() => setForm(f => ({ ...f, avatar: src }))}
                    className={`rounded-xl overflow-hidden border-2 transition-all aspect-square ${form.avatar === src ? "border-primary scale-105" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    <img src={src} alt="avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {PLAYER_AVATARS.map((avatar) => (
                  <button key={avatar} type="button"
                    className={`text-2xl p-2.5 rounded-xl border transition-all ${form.avatar === avatar ? "border-primary bg-primary/20" : "border-border bg-secondary/50"}`}
                    onClick={() => setForm(f => ({ ...f, avatar }))}>
                    {avatar}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Handle</Label>
            <Input value={form.handle} onChange={(e) => setForm(f => ({ ...f, handle: e.target.value.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, "") }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea placeholder="Tell something about yourself..." value={form.bio} onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))} rows={2} className="resize-none" maxLength={200} />
            <p className="text-[10px] text-muted-foreground text-right">{form.bio.length}/200</p>
          </div>
          {isPlayer && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Game Settings</Label>
              <Select value={form.game} onValueChange={(val) => setForm(f => ({ ...f, game: val }))}>
                <SelectTrigger><SelectValue placeholder="Select a game" /></SelectTrigger>
                <SelectContent>
                  {availableGames.map((g) => <SelectItem key={g.id} value={g.name}>🎮 {g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Your in-game UID" value={form.gameUid} onChange={(e) => setForm(f => ({ ...f, gameUid: e.target.value }))} />
            </div>
          )}
          {isEsports && (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <span className="text-yellow-400">🎖️</span> Esports Profile Style
              </Label>
              <div className="space-y-2">
                <Label className="text-xs">Animation</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PROFILE_ANIMATIONS.map(a => (
                    <button key={a.value} type="button" onClick={() => setForm(f => ({ ...f, profileAnimation: a.value }))}
                      className={cn("text-xs py-2 px-3 rounded-xl border transition-all text-left", form.profileAnimation === a.value ? "border-primary bg-primary/20 text-primary font-semibold" : "border-border bg-secondary/50 text-muted-foreground")}>
                      {a.value === "" && "✦ "}{a.value === "pulse" && "✦ "}{a.value === "neon" && "⚡ "}{a.value === "shimmer" && "✨ "}{a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Profile Color</Label>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_COLORS.map(c => (
                    <button key={c.value} type="button" onClick={() => setForm(f => ({ ...f, profileColor: c.value }))}
                      className={cn("w-8 h-8 rounded-full border-2 transition-all", form.profileColor === c.value ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100")}
                      style={{ backgroundColor: c.hex }} title={c.label} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Social Links</Label>
            <div className="space-y-2">
              {[
                { key: "instagram" as const, label: "Instagram" },
                { key: "discord" as const, label: "Discord" },
                { key: "x" as const, label: "X / Twitter" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-sm w-20 shrink-0 text-muted-foreground">{label}</span>
                  <Input placeholder="username" value={(form as any)[key]} onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              {isHost && (
                <div className="flex items-center gap-2">
                  <span className="text-sm w-20 shrink-0 text-muted-foreground">YouTube</span>
                  <Input placeholder="channel name" value={form.youtube} onChange={(e) => setForm(f => ({ ...f, youtube: e.target.value }))} />
                </div>
              )}
            </div>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={isPending}>{isPending ? "Saving..." : "Save Changes"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProfileBanner({ profileAnimation, profileColor }: { profileAnimation?: string | null; profileColor?: string | null }) {
  const hasStyle = !!(profileColor || profileAnimation);
  const animClass = profileAnimation === "pulse" ? "profile-banner-pulse" : profileAnimation === "neon" ? "profile-banner-neon" : profileAnimation === "shimmer" ? "profile-banner-shimmer" : "";
  const gradient = getBannerGradient(profileColor, profileAnimation);
  if (!hasStyle) return <div className="h-20 w-full bg-secondary/30" />;
  return (
    <div className={cn("profile-banner h-28 w-full relative overflow-hidden", animClass)} style={{ backgroundImage: gradient }}>
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}

function OwnProfile() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<"posts" | "squad" | "stats">("posts");
  const [editOpen, setEditOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  const { data: myMatches, isLoading: matchesLoading } = useGetMyMatches();
  if (!user) return null;
  const isPlayer = user.role === "player";
  const isHost = user.role === "host" || user.role === "admin";
  const isEsports = isPlayer && (user as any).isEsportsPlayer;
  const animation = (user as any).profileAnimation;
  const color = (user as any).profileColor;
  const animContainerClass = animation === "pulse" ? "profile-anim-pulse" : animation === "neon" ? "profile-anim-neon" : animation === "shimmer" ? "profile-anim-shimmer" : "";
  const colorClass = color ? `profile-color-${color}` : "";
  const tabs = isHost
    ? [{ id: "posts" as const, icon: <Swords className="w-4 h-4" />, label: "Matches" }]
    : isEsports
      ? [{ id: "posts" as const, icon: <Grid3X3 className="w-4 h-4" />, label: "Posts" }, { id: "squad" as const, icon: <Users className="w-4 h-4" />, label: "Squad" }, { id: "stats" as const, icon: <BarChart2 className="w-4 h-4" />, label: "Stats" }]
      : [{ id: "posts" as const, icon: <Grid3X3 className="w-4 h-4" />, label: "Posts" }, { id: "squad" as const, icon: <Users className="w-4 h-4" />, label: "Squad" }];

  return (
    <AppLayout title="My Profile">
      <div className={cn("pb-4", animContainerClass, colorClass)}>
        <div className="relative">
          <ProfileBanner profileAnimation={animation} profileColor={color} />
          <div className="px-4">
            <div className="flex items-end justify-between -mt-10 mb-3">
              <div className="profile-avatar-wrap">
                <AvatarDisplay avatar={user.avatar} className={cn("w-20 h-20 rounded-2xl text-4xl border-4 border-background", getFrameClass((user as any).equippedFrame))} />
              </div>
              <div className="flex gap-2 pb-1">
                <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-card hover:bg-secondary/60 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <Link href="/settings">
                  <button className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-card hover:bg-secondary/60 transition-colors">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </div>
            </div>
            <div className="mb-3">
              <h2 className="text-xl font-black flex items-center gap-1.5">
                {user.name || "Player"}
                {getBadgeEmoji((user as any).equippedBadge) && <span className="text-base">{getBadgeEmoji((user as any).equippedBadge)}</span>}
              </h2>
              <p className={cn("text-sm", getHandleColorClass((user as any).equippedHandleColor) ?? "text-muted-foreground")}>@{user.handle || user.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {user.role === "admin" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><ShieldCheck className="w-3 h-3" /> Admin</span>}
                {user.role === "host" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400"><ShieldCheck className="w-3 h-3" /> Host</span>}
                {(user as any).game && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/15 text-primary border border-primary/30 rounded-full px-2.5 py-0.5">🎮 {(user as any).game}</span>}
                {isEsports && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2.5 py-0.5">🎖️ Esports</span>}
              </div>
            </div>
            {(user as any).bio && <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{(user as any).bio}</p>}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <button className="text-center hover:opacity-80 transition-opacity" onClick={() => setFollowersOpen(true)}>
                <div className="font-black text-lg">{user.followersCount ?? 0}</div>
                <div className="text-xs text-muted-foreground">Followers</div>
              </button>
              <button className="text-center hover:opacity-80 transition-opacity" onClick={() => setFollowingOpen(true)}>
                <div className="font-black text-lg">{user.followingCount ?? 0}</div>
                <div className="text-xs text-muted-foreground">Following</div>
              </button>
              <div className="text-center">
                <div className="font-black text-lg text-primary"><GoldCoin amount={user.balance.toFixed(0)} /></div>
                <div className="text-xs text-muted-foreground">Balance</div>
              </div>
            </div>
            <SocialLinksDisplay instagram={user.instagram} discord={user.discord} x={user.x} youtube={user.youtube} />
          </div>
        </div>

        {user.handle && (
          <>
            <FollowersModal handle={user.handle} count={user.followersCount ?? 0} type="followers" open={followersOpen} onClose={() => setFollowersOpen(false)} />
            <FollowersModal handle={user.handle} count={user.followingCount ?? 0} type="following" open={followingOpen} onClose={() => setFollowingOpen(false)} />
          </>
        )}

        <div className="mt-4 border-t border-border">
          <div className="flex">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={cn("flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors border-b-2",
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {isHost && tab === "posts" && (
          <div className="p-4">
            {matchesLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
            ) : myMatches?.participated.length ? (
              <div className="flex flex-col gap-2">{myMatches.participated.map(m => <MatchCard key={m.id} match={m} />)}</div>
            ) : (
              <div className="text-center py-8 text-muted-foreground"><div className="text-3xl mb-2">🎮</div><p className="text-sm">No active matches</p></div>
            )}
          </div>
        )}

        {isPlayer && tab === "posts" && user.id && <PostGrid userId={user.id} isOwn />}
        {isPlayer && tab === "squad" && <SquadSection userId={user.id!} isOwn userGame={(user as any).game} isEsports={isEsports} />}
        {isEsports && tab === "stats" && <EsportsStatsEditor userGame={(user as any).game} />}
      </div>
      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} user={user} refreshUser={refreshUser} />
    </AppLayout>
  );
}

function PublicProfile({ handle }: { handle: string }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading, refetch } = useGetUserProfile(handle);
  const { mutateAsync: follow } = useFollowUser();
  const { mutateAsync: unfollow } = useUnfollowUser();
  const [tab, setTab] = useState<string>("posts");
  const [rateOpen, setRateOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  const [hostGroup, setHostGroup] = useState<{ id: number; name: string; avatar: string; memberCount: number; isPublic: boolean } | null>(null);

  const { data: hasPlayedData } = useQuery({
    queryKey: ["hasPlayedWith", handle],
    queryFn: () => customFetch<{ hasPlayed: boolean }>(`/api/users/${handle}/has-played-with`),
    enabled: !!(currentUser?.role === "player" && profile?.role === "host"),
  });

  useEffect(() => {
    if (profile?.role === "host" && profile.id) {
      customFetch<any>(`/api/groups/by-host/${profile.id}`).then(setHostGroup).catch(() => {});
    }
  }, [profile?.id, profile?.role]);

  const handleFollow = async () => {
    try {
      if (profile?.isFollowing) { await unfollow({ handle }); } else { await follow({ handle }); }
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  if (isLoading) return (
    <AppLayout showBack backHref="/explore" title="Profile">
      <Skeleton className="h-28 w-full" />
      <div className="p-4 space-y-3"><Skeleton className="h-20 rounded-2xl" /></div>
    </AppLayout>
  );
  if (!profile) return (
    <AppLayout showBack backHref="/explore" title="Profile">
      <div className="text-center py-16 text-muted-foreground">User not found</div>
    </AppLayout>
  );

  const isOwnProfile = currentUser?.handle === handle;
  const isPlayer = profile.role === "player";
  const isHost = profile.role === "host" || profile.role === "admin";
  const isEsports = isPlayer && (profile as any).isEsportsPlayer;
  const animation = (profile as any).profileAnimation;
  const color = (profile as any).profileColor;
  const animContainerClass = animation === "pulse" ? "profile-anim-pulse" : animation === "neon" ? "profile-anim-neon" : animation === "shimmer" ? "profile-anim-shimmer" : "";
  const colorClass = color ? `profile-color-${color}` : "";
  const hasPlayed = hasPlayedData?.hasPlayed ?? false;

  const tabs = isHost
    ? [{ id: "matches", label: "Matches", icon: <Swords className="w-4 h-4" /> }]
    : isEsports
      ? [{ id: "posts", label: "Posts", icon: <Grid3X3 className="w-4 h-4" /> }, { id: "matches", label: "Matches", icon: <Swords className="w-4 h-4" /> }, { id: "squad", label: "Squad", icon: <Users className="w-4 h-4" /> }, { id: "stats", label: "Stats", icon: <BarChart2 className="w-4 h-4" /> }]
      : [{ id: "posts", label: "Posts", icon: <Grid3X3 className="w-4 h-4" /> }, { id: "matches", label: "Matches", icon: <Swords className="w-4 h-4" /> }];

  const activeTab = tab;

  return (
    <AppLayout showBack backHref="/explore" title={`@${handle}`}>
      <div className={cn("pb-4", animContainerClass, colorClass)}>
        <div className="relative">
          <ProfileBanner profileAnimation={animation} profileColor={color} />
          <div className="px-4">
            <div className="flex items-end justify-between -mt-10 mb-3">
              <div className="profile-avatar-wrap">
                <AvatarDisplay avatar={profile.avatar} className={cn("w-20 h-20 rounded-2xl text-4xl border-4 border-background", getFrameClass((profile as any).equippedFrame))} />
              </div>
              {!isOwnProfile && currentUser && (
                <div className="flex gap-2 pb-1">
                  {canChat(currentUser.role, profile.role ?? "") && (
                    <Link href={`/chat/${profile.id}`}>
                      <button className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-xl px-3 py-1.5 bg-card hover:bg-secondary/60 transition-colors">
                        <MessageCircle className="w-3.5 h-3.5" /> Message
                      </button>
                    </Link>
                  )}
                  <button onClick={handleFollow}
                    className={cn("flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors", profile.isFollowing ? "border border-border bg-card hover:bg-secondary/60" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
                    {profile.isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              )}
            </div>

            <div className="mb-3">
              <h2 className="text-xl font-black flex items-center gap-1.5">
                {profile.name || `@${handle}`}
                {getBadgeEmoji((profile as any).equippedBadge) && <span className="text-base">{getBadgeEmoji((profile as any).equippedBadge)}</span>}
              </h2>
              <p className={cn("text-sm", getHandleColorClass((profile as any).equippedHandleColor) ?? "text-muted-foreground")}>@{profile.handle}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {profile.role === "admin" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><ShieldCheck className="w-3 h-3" /> Admin</span>}
                {profile.role === "host" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400"><ShieldCheck className="w-3 h-3" /> Host</span>}
                {(profile as any).game && isPlayer && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/15 text-primary border border-primary/30 rounded-full px-2.5 py-0.5">🎮 {(profile as any).game}</span>}
                {isEsports && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2.5 py-0.5">🎖️ Esports</span>}
                {isHost && (profile as any).rating && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-yellow-500/10 text-yellow-400 rounded-full px-2.5 py-0.5">
                    <Star className="w-3 h-3 fill-yellow-400" /> {(profile as any).rating?.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {(profile as any).bio && <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{(profile as any).bio}</p>}

            <div className="grid grid-cols-3 gap-3 mb-3">
              <button className="text-center hover:opacity-80" onClick={() => setFollowersOpen(true)}>
                <div className="font-black text-lg">{profile.followersCount}</div>
                <div className="text-xs text-muted-foreground">Followers</div>
              </button>
              <button className="text-center hover:opacity-80" onClick={() => setFollowingOpen(true)}>
                <div className="font-black text-lg">{profile.followingCount}</div>
                <div className="text-xs text-muted-foreground">Following</div>
              </button>
              <div className="text-center">
                <div className="font-black text-lg">{profile.matchesCount}</div>
                <div className="text-xs text-muted-foreground">{isHost ? "Matches" : "Played"}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SocialLinksDisplay instagram={(profile as any).instagram} discord={(profile as any).discord} x={(profile as any).x} youtube={(profile as any).youtube} />
              {isHost && !isOwnProfile && currentUser?.role === "player" && hasPlayed && (
                <button onClick={() => setRateOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-3 py-1.5 transition-colors">
                  <Star className="w-3.5 h-3.5" /> Rate Host
                </button>
              )}
            </div>
          </div>
        </div>

        <FollowersModal handle={handle} count={profile.followersCount} type="followers" open={followersOpen} onClose={() => setFollowersOpen(false)} />
        <FollowersModal handle={handle} count={profile.followingCount} type="following" open={followingOpen} onClose={() => setFollowingOpen(false)} />

        {profile.role === "host" && hostGroup && (
          <div className="px-4 mt-3">
            <Link href={`/chat/group/${hostGroup.id}`}>
              <div className="bg-card border border-card-border rounded-2xl p-3 cursor-pointer hover:bg-secondary/30 transition-all flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl shrink-0">{hostGroup.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-blue-400 shrink-0" /><p className="text-sm font-semibold truncate">{hostGroup.name}</p></div>
                  <p className="text-xs text-muted-foreground">{hostGroup.memberCount} members · {hostGroup.isPublic ? "Public" : "Private"}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          </div>
        )}

        {!isHost && (
          <div className="mt-4 border-t border-border">
            <div className="flex">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn("flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors border-b-2",
                    activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isPlayer && activeTab === "posts" && <PostGrid userId={profile.id} isOwn={false} />}
        {isPlayer && activeTab === "matches" && <PlayerMatchHistory userId={profile.id} />}
        {isEsports && activeTab === "squad" && <SquadSection userId={profile.id} isOwn={false} userGame={(profile as any).game} isEsports />}
        {isEsports && activeTab === "stats" && <EsportsStatsDisplay handle={handle} game={(profile as any).game} />}

        {isHost && (
          <div className="p-4 space-y-6">
            <div className="space-y-4">
              {profile.activeMatches.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 text-green-400">● Live</h3>
                  <div className="flex flex-col gap-2">{profile.activeMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
                </div>
              )}
              {profile.upcomingMatches.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Upcoming</h3>
                  <div className="flex flex-col gap-2">{profile.upcomingMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
                </div>
              )}
              {profile.activeMatches.length === 0 && profile.upcomingMatches.length === 0 && (
                <div className="text-center py-6 text-muted-foreground"><div className="text-3xl mb-2">🎮</div><p className="text-sm">No active matches</p></div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> Ratings & Reviews</h3>
              </div>
              <HostRatingsSection handle={handle} />
            </div>
          </div>
        )}
      </div>

      {isHost && (
        <RateHostDialog hostHandle={handle} hostName={profile.name || handle} open={rateOpen} onClose={() => setRateOpen(false)} />
      )}
    </AppLayout>
  );
}

export default function ProfilePage() {
  const [, params] = useRoute("/profile/:handle");
  const { user } = useAuth();
  if (params?.handle) {
    if (user?.handle === params.handle) return <OwnProfile />;
    return <PublicProfile handle={params.handle} />;
  }
  return <OwnProfile />;
}
