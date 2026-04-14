import { useState, useEffect, useRef } from "react";
import { Camera, X, Heart, MessageCircle, Send, UserPlus, UserCheck, ShieldCheck, Star, Lock, Clapperboard, ImageIcon } from "lucide-react";
import { Link } from "wouter";
import { customFetch, useFollowUser, useUnfollowUser } from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/useAuth";
import { useQueryClient } from "@tanstack/react-query";

export interface Post {
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

export function PostCard({ post }: { post: Post }) {
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

      <div className="w-full aspect-video overflow-hidden relative">
        <img src={imageSrc} alt="Post" className="w-full h-full object-cover" />
        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded-full p-1.5">
          <Lock className="w-3 h-3 text-yellow-400" />
        </div>
      </div>

      {post.caption && (
        <div className="px-4 pt-2.5">
          <p className="text-sm text-foreground">{post.caption}</p>
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-2.5">
        <button onClick={toggleLike} className="flex items-center gap-1.5 group">
          <Heart className={cn("w-5 h-5 transition-all", liked ? "fill-red-500 text-red-500 scale-110" : "text-muted-foreground group-hover:text-red-400")} />
          <span className={cn("text-sm tabular-nums", liked ? "text-red-500" : "text-muted-foreground")}>{likeCount}</span>
        </button>
        <button onClick={handleToggleComments} className="flex items-center gap-1.5 group">
          <MessageCircle className={cn("w-5 h-5 transition-colors", commentsOpen ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
          <span className={cn("text-sm tabular-nums", commentsOpen ? "text-primary" : "text-muted-foreground")}>{commentCount}</span>
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
                    <span className="text-xs font-semibold text-foreground">{c.userName || `@${c.userHandle}`}</span>
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
            <button onClick={submitComment} disabled={!commentInput.trim() || submitting} className="text-primary disabled:opacity-40 transition-opacity">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SharePostDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "clip">("image");
  const [caption, setCaption] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCaption("");
    setMediaType("image");
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
    if (!imageFile) { toast({ title: "Select an image", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      await customFetch("/api/posts", { method: "POST", body: JSON.stringify({ imageUrl, caption: caption.trim() || null }) });
      toast({ title: "Posted!" });
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
            {mediaType === "image" ? <Camera className="w-4 h-4 text-primary" /> : <Clapperboard className="w-4 h-4 text-primary" />}
            Share a Moment
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {/* Image / Clips tab toggle */}
          <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
            <button
              onClick={() => { setMediaType("image"); handleRemoveImage(); }}
              className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all", mediaType === "image" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <ImageIcon className="w-3.5 h-3.5" /> Image
            </button>
            <button
              onClick={() => { setMediaType("clip"); handleRemoveImage(); }}
              className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all", mediaType === "clip" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Clapperboard className="w-3.5 h-3.5" /> Clips
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

          {mediaType === "image" ? (
            <div className="w-full flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl py-10 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5" />
              <ImageIcon className="w-8 h-8 text-muted-foreground relative z-10" />
              <span className="text-sm font-medium text-muted-foreground relative z-10">Image Sharing</span>
              <span className="text-xs text-primary/70 font-semibold border border-primary/30 bg-primary/10 rounded-full px-3 py-1 relative z-10">Coming Soon</span>
              <span className="text-xs text-muted-foreground/60 text-center px-6 relative z-10">Image support is on the way — stay tuned!</span>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl py-10 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5" />
              <Clapperboard className="w-8 h-8 text-muted-foreground relative z-10" />
              <span className="text-sm font-medium text-muted-foreground relative z-10">Clips</span>
              <span className="text-xs text-primary/70 font-semibold border border-primary/30 bg-primary/10 rounded-full px-3 py-1 relative z-10">Coming Soon</span>
              <span className="text-xs text-muted-foreground/60 text-center px-6 relative z-10">Video clips support is on the way — stay tuned!</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Caption <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea placeholder="Say something about this moment..." value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} className="resize-none" />
          </div>
          <Button className="w-full" disabled={true}>
            Coming Soon
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InlinHostCard({ profile }: { profile: UserProfile }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast: showToast } = useToast();
  const [following, setFollowing] = useState(profile.isFollowing ?? false);
  const { mutateAsync: follow, isPending: isFollowing } = useFollowUser();
  const { mutateAsync: unfollow, isPending: isUnfollowing } = useUnfollowUser();
  const isSelf = user?.id === profile.id;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const was = following; setFollowing(!was);
    try {
      was ? await unfollow({ handle: profile.handle! }) : await follow({ handle: profile.handle! });
      queryClient.invalidateQueries({ queryKey: ["exploreUsers"] });
    } catch {
      setFollowing(was);
      showToast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const inner = (
    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 my-3 hover:border-primary/40 transition-all cursor-pointer">
      <div className="text-xs font-semibold text-primary/60 absolute -top-2 left-3 bg-background px-1">Recommended Host</div>
      {(profile.avatar?.startsWith("/") || profile.avatar?.startsWith("http")) ? (
        <img src={profile.avatar.startsWith("/objects/") ? `/api/storage${profile.avatar}` : profile.avatar} alt="avatar" className="w-11 h-11 rounded-2xl object-cover bg-secondary shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-2xl bg-primary/20 flex items-center justify-center text-xl shrink-0">{profile.avatar || "🎮"}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm truncate">{profile.name || `@${profile.handle}`}</span>
          <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${profile.role === "admin" ? "text-primary" : "text-orange-400"}`} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>@{profile.handle}</span>
          {profile.matchesCount ? <span>· {profile.matchesCount} matches</span> : null}
          {profile.rating && <span className="flex items-center gap-0.5 text-yellow-400"><Star className="w-3 h-3 fill-yellow-400" />{profile.rating.toFixed(1)}</span>}
        </div>
      </div>
      {user && !isSelf && profile.handle && (
        <Button size="sm" variant={following ? "secondary" : "default"} className="h-7 px-2.5 text-xs gap-1 shrink-0" onClick={handleToggle} disabled={isFollowing || isUnfollowing}>
          {following ? <><UserCheck className="w-3 h-3" />Following</> : <><UserPlus className="w-3 h-3" />Follow</>}
        </Button>
      )}
    </div>
  );

  if (!profile.handle) return <div className="relative">{inner}</div>;
  return <Link href={`/profile/${profile.handle}`}><div className="relative">{inner}</div></Link>;
}

export function PostsFeed({ recommendedHosts = [], isLoadingHosts = false, refreshSignal = 0 }: { recommendedHosts?: UserProfile[]; isLoadingHosts?: boolean; refreshSignal?: number }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    customFetch<Post[]>("/api/posts?limit=20").then(setPosts).catch(() => setPosts([])).finally(() => setLoading(false));
  }, [refreshKey, refreshSignal]);

  const feedItems: Array<{ type: "post"; data: Post } | { type: "host"; data: UserProfile }> = [];
  let hostIdx = 0;
  posts.forEach((post, i) => {
    feedItems.push({ type: "post", data: post });
    if ((i + 1) % 3 === 0 && hostIdx < recommendedHosts.length) {
      feedItems.push({ type: "host", data: recommendedHosts[hostIdx++] });
    }
  });
  while (hostIdx < recommendedHosts.length) {
    feedItems.push({ type: "host", data: recommendedHosts[hostIdx++] });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-medium">Highlights & Clips</p>
      {loading || isLoadingHosts ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
      ) : feedItems.length > 0 ? (
        <div className="space-y-3">
          {feedItems.map((item, i) =>
            item.type === "post"
              ? <PostCard key={`post-${item.data.id}`} post={item.data as Post} />
              : <InlinHostCard key={`host-${item.data.id}-${i}`} profile={item.data} />
          )}
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
