import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Search, Users, Camera, X, Heart, MessageCircle, Send } from "lucide-react";
import { useListMatches, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { SilverCoinIcon } from "@/components/ui/Coins";

const FILTERS = ["upcoming", "live"] as const;
type Filter = typeof FILTERS[number];

interface Post {
  id: number;
  userId: number;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  userName: string | null;
  userHandle: string | null;
  userAvatar: string | null;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
}

interface Comment {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: string;
  userName: string | null;
  userHandle: string | null;
  userAvatar: string | null;
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function avatarSrc(avatar: string | null) {
  if (!avatar) return null;
  if (avatar.startsWith("/objects/")) return `/api/storage${avatar}`;
  return avatar;
}

function UserAvatar({ avatar, name, size = 8 }: { avatar: string | null; name: string | null; size?: number }) {
  const src = avatarSrc(avatar);
  const isImg = src && (src.startsWith("/") || src.startsWith("http"));
  const cls = `w-${size} h-${size} rounded-xl overflow-hidden shrink-0`;
  return (
    <div className={cls}>
      {isImg ? (
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-primary/20 flex items-center justify-center text-sm">{avatar || "🎮"}</div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likesCount);
  const [commentCount, setCommentCount] = useState(post.commentsCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const imageSrc = post.imageUrl.startsWith("data:")
    ? post.imageUrl
    : post.imageUrl.startsWith("/objects/")
      ? `/api/storage${post.imageUrl}`
      : post.imageUrl;

  const toggleLike = async () => {
    const prev = liked;
    setLiked(!prev);
    setLikeCount((c) => (prev ? c - 1 : c + 1));
    try {
      await customFetch(`/api/posts/${post.id}/like`, { method: "POST" });
    } catch {
      setLiked(prev);
      setLikeCount((c) => (prev ? c + 1 : c - 1));
    }
  };

  const fetchComments = async () => {
    setCommentsLoading(true);
    try {
      const data = await customFetch<Comment[]>(`/api/posts/${post.id}/comments`);
      setComments(data);
      setCommentsLoaded(true);
    } catch {
      toast({ title: "Failed to load comments", variant: "destructive" });
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleToggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsLoaded) fetchComments();
    if (next) setTimeout(() => inputRef.current?.focus(), 150);
  };

  const submitComment = async () => {
    if (!commentInput.trim() || submitting) return;
    setSubmitting(true);
    try {
      const newComment = await customFetch<Comment>(`/api/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      setComments((prev) => [...prev, newComment]);
      setCommentCount((c) => c + 1);
      setCommentInput("");
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <UserAvatar avatar={post.userAvatar} name={post.userName} size={8} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{post.userName || `@${post.userHandle}`}</p>
          <p className="text-[10px] text-muted-foreground">@{post.userHandle} · {formatRelative(post.createdAt)}</p>
        </div>
      </div>

      <div className="w-full aspect-video overflow-hidden">
        <img src={imageSrc} alt="Post" className="w-full h-full object-cover" />
      </div>

      {post.caption && (
        <div className="px-4 pt-2.5">
          <p className="text-sm text-foreground">{post.caption}</p>
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-2.5">
        <button
          onClick={toggleLike}
          className="flex items-center gap-1.5 group"
        >
          <Heart
            className={cn(
              "w-5 h-5 transition-all",
              liked
                ? "fill-red-500 text-red-500 scale-110"
                : "text-muted-foreground group-hover:text-red-400"
            )}
          />
          <span className={cn("text-sm tabular-nums", liked ? "text-red-500" : "text-muted-foreground")}>
            {likeCount}
          </span>
        </button>

        <button
          onClick={handleToggleComments}
          className="flex items-center gap-1.5 group"
        >
          <MessageCircle
            className={cn(
              "w-5 h-5 transition-colors",
              commentsOpen ? "text-primary" : "text-muted-foreground group-hover:text-primary"
            )}
          />
          <span className={cn("text-sm tabular-nums", commentsOpen ? "text-primary" : "text-muted-foreground")}>
            {commentCount}
          </span>
        </button>
      </div>

      {commentsOpen && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {commentsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <Skeleton className="w-6 h-6 rounded-lg shrink-0" />
                  <Skeleton className="flex-1 h-8 rounded-lg" />
                </div>
              ))}
            </div>
          ) : comments.length > 0 ? (
            <div className="space-y-2.5 max-h-48 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <UserAvatar avatar={c.userAvatar} name={c.userName} size={6} />
                  <div className="flex-1 min-w-0 bg-secondary/40 rounded-xl px-3 py-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {c.userName || `@${c.userHandle}`}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1.5">{formatRelative(c.createdAt)}</span>
                    <p className="text-sm text-foreground mt-0.5 break-words">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-1">No comments yet. Be the first!</p>
          )}

          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
            />
            <button
              onClick={submitComment}
              disabled={!commentInput.trim() || submitting}
              className="text-primary disabled:opacity-40 transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SharePostDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const silverCoins = user?.silverCoins ?? 0;
  const canPost = silverCoins >= 10;

  const reset = () => {
    setCaption("");
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!imageFile) {
      toast({ title: "Select an image", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      await customFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({ imageUrl, caption: caption.trim() || null }),
      });
      toast({ title: "Posted!", description: "10 Silver Coins deducted." });
      reset();
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to post", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || user.role !== "player") return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" variant="outline">
          <Camera className="w-3.5 h-3.5" /> Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" /> Share a Moment
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {!canPost && (
            <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-3 py-2 text-xs text-yellow-400">
              You need 10 Silver Coins to post. You have {silverCoins}.
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SilverCoinIcon size="sm" />
            <span>Posting costs <span className="font-bold text-foreground">10 Silver Coins</span></span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          {imagePreview ? (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={imagePreview} alt="Preview" className="w-full aspect-video object-cover" />
              <button
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-black/70 rounded-full p-1"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-xl py-10 hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <Camera className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tap to select image</span>
            </button>
          )}
          <div className="space-y-1.5">
            <Label>Caption <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Say something about this moment..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || !imageFile || !canPost}
          >
            {isSubmitting ? "Posting..." : "Post · -10 Silver"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PostsFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    customFetch<Post[]>("/api/posts?limit=20")
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Player posts & highlights</p>
        <SharePostDialog onSuccess={refresh} />
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map(p => <PostCard key={p.id} post={p} />)}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📸</div>
          <h3 className="font-semibold text-base mb-1">No posts yet</h3>
          <p className="text-muted-foreground text-sm">Be the first to share a gaming moment!</p>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("upcoming");
  const { user } = useAuth();

  const { data: rawMatches, isLoading } = useListMatches(
    { status: filter, search: search || undefined },
    { query: { staleTime: 10000 } }
  );
  const matches = (rawMatches ?? []).filter((m: any) => m.status !== "completed");

  const isPlayer = user?.role === "player";

  const followingMatches = isPlayer
    ? (matches ?? []).filter((m: any) => !m.isRecommended)
    : (matches ?? []);
  const recommendedMatches = isPlayer
    ? (matches ?? []).filter((m: any) => m.isRecommended)
    : [];

  const matchesContent = isLoading ? (
    <div className="space-y-5">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  ) : isPlayer ? (
    <div className="space-y-6">
      {followingMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Following</h2>
            <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
              {followingMatches.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {followingMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}
      {recommendedMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Recommended</h2>
            <span className="text-xs font-medium bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
              For You
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {recommendedMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}
      {followingMatches.length === 0 && recommendedMatches.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🎮</div>
          <h3 className="font-semibold text-base mb-1">No matches yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {search ? "Try a different search" : "Follow hosts to see their matches here"}
          </p>
          {!search && (
            <Link href="/explore">
              <Button variant="outline" className="gap-2">
                <Users className="w-4 h-4" />
                Find Hosts
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  ) : (
    matches && matches.length > 0 ? (
      <div className="flex flex-col gap-2">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    ) : (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🎮</div>
        <h3 className="font-semibold text-base mb-1">No matches found</h3>
        <p className="text-muted-foreground text-sm">
          {search ? "Try a different search" : "Check back later for upcoming tournaments"}
        </p>
      </div>
    )
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-bold">Tournaments</h1>
            <p className="text-muted-foreground text-sm">Join a match and compete</p>
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

        <div className="mt-3 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 border transition-all capitalize",
                  filter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {matchesContent}
        </div>
      </div>
    </AppLayout>
  );
}
