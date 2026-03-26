import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetUserProfile, useFollowUser, useUnfollowUser,
  useGetMySquad, useAddSquadMember, useUpdateMyProfile, useGetMe,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Users, Star, Swords, LogOut, Settings, Plus, Trash2, MessageCircle, Crown, Flag, ShieldCheck, Copy, Check, Gift, Link } from "lucide-react";
import { cn } from "@/lib/utils";

const COMPLAINT_TOPICS = [
  { id: "Withdrawal Issue", label: "Withdrawal Issue", icon: "💸" },
  { id: "Add Balance Issue", label: "Add Balance Issue", icon: "💳" },
  { id: "Bugs", label: "Bugs / Errors", icon: "🐛" },
  { id: "Host Issues", label: "Host Issues", icon: "🛡️" },
  { id: "Other", label: "Other", icon: "📋" },
];

function RaiseComplaintDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [hostHandle, setHostHandle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setTopic("");
    setDescription("");
    setHostHandle("");
  };

  const handleSubmit = async () => {
    if (!topic || !description.trim()) {
      toast({ title: "Please select a topic and write a description", variant: "destructive" });
      return;
    }
    if (topic === "Host Issues" && !hostHandle.trim()) {
      toast({ title: "Please enter the host's handle", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await customFetch("/api/complaints", {
        method: "POST",
        body: JSON.stringify({
          subject: topic,
          description: description.trim(),
          hostHandle: topic === "Host Issues" ? hostHandle.trim() : undefined,
        }),
      });
      toast({ title: "Complaint submitted!", description: "Our team will review it shortly." });
      reset();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err?.data?.error, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" title="Raise a Complaint">
          <Flag className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-destructive" /> Raise a Complaint
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          <div className="space-y-2">
            <Label>Topic</Label>
            <div className="grid grid-cols-2 gap-2">
              {COMPLAINT_TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTopic(t.id); if (t.id !== "Host Issues") setHostHandle(""); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left",
                    topic === t.id
                      ? "bg-primary/15 border-primary text-primary"
                      : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  )}
                >
                  <span className="text-base shrink-0">{t.icon}</span>
                  <span className="leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {topic === "Host Issues" && (
            <div className="space-y-1.5">
              <Label>Host Handle</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input
                  placeholder="hosthandle"
                  value={hostHandle}
                  onChange={(e) => setHostHandle(e.target.value.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, ""))}
                  className="pl-7"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe your issue in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || !topic || !description.trim()}
          >
            {isSubmitting ? "Submitting..." : "Submit Complaint"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function canChat(senderRole: string, recipientRole: string): boolean {
  if (senderRole === "player" && recipientRole === "admin") return false;
  return true;
}

const AVATARS = ["🎮", "🏆", "⚔️", "🔥", "💀", "👑", "🎯", "🦾", "🤑", "🤒", "😴", "🧔", "👩‍🦰", "🐲", "⚡️", "🗿"];
const HOST_AVATARS: Record<string, string[]> = {
  "Free Fire": [
    "/avatars/ff-avatar-1.jpeg",
    "/avatars/ff-avatar-2.jpeg",
    "/avatars/ff-avatar-3.jpeg",
    "/avatars/ff-avatar-4.jpeg",
    "/avatars/ff-avatar-5.jpeg",
  ],
  "BGMI": [
    "/avatars/bgmi-avatar-1.jpeg",
    "/avatars/bgmi-avatar-2.jpeg",
    "/avatars/bgmi-avatar-3.jpeg",
    "/avatars/bgmi-avatar-4.jpeg",
  ],
};

function isImageAvatar(avatar: string | null | undefined): boolean {
  return !!avatar && (avatar.startsWith("/") || avatar.startsWith("http"));
}

function resolveAvatarSrc(avatar: string): string {
  if (avatar.startsWith("/objects/")) return `/api/storage${avatar}`;
  return avatar;
}

export function AvatarDisplay({
  avatar,
  className = "w-16 h-16 rounded-2xl text-3xl",
}: {
  avatar?: string | null;
  className?: string;
}) {
  if (isImageAvatar(avatar)) {
    return (
      <img
        src={resolveAvatarSrc(avatar!)}
        alt="avatar"
        className={`${className} object-cover bg-secondary`}
      />
    );
  }
  return (
    <div className={`${className} bg-primary/20 flex items-center justify-center`}>
      {avatar || "🎮"}
    </div>
  );
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

function SocialLinksDisplay({ instagram, discord, x, youtube, twitch }: {
  instagram?: string | null;
  discord?: string | null;
  x?: string | null;
  youtube?: string | null;
  twitch?: string | null;
}) {
  const links = [
    { key: "Instagram" as const, value: instagram, href: (v: string) => `https://instagram.com/${extractHandle(v)}`, color: "text-pink-400 hover:text-pink-300", bg: "bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/20" },
    { key: "Discord" as const, value: discord, href: (v: string) => `https://discord.com/users/${extractHandle(v)}`, color: "text-indigo-400 hover:text-indigo-300", bg: "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20" },
    { key: "X" as const, value: x, href: (v: string) => `https://x.com/${extractHandle(v)}`, color: "text-sky-400 hover:text-sky-300", bg: "bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20" },
    { key: "YouTube" as const, value: youtube, href: (v: string) => `https://youtube.com/@${extractHandle(v)}`, color: "text-red-400 hover:text-red-300", bg: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20" },
  ].filter(l => l.value);

  if (!links.length) return null;

  return (
    <div className="flex gap-2 mt-3">
      {links.map(({ key, value, href, color, bg }) => (
        <a
          key={key}
          href={href(value!)}
          target="_blank"
          rel="noopener noreferrer"
          title={key}
          className={cn("inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all", bg, color)}
        >
          {SocialIcons[key]}
        </a>
      ))}
    </div>
  );
}

function OwnProfile() {
  const { user, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: squad, refetch: refetchSquad } = useGetMySquad();
  const { mutateAsync: addSquadMember, isPending: isAdding } = useAddSquadMember();
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateMyProfile();
  const { data: myMatches, isLoading: matchesLoading } = useGetMyMatches();

  const [squadForm, setSquadForm] = useState({ name: "", uid: "" });
  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? "",
    handle: user?.handle ?? "",
    avatar: user?.avatar ?? "🎮",
    instagram: user?.instagram ?? "",
    discord: user?.discord ?? "",
    x: user?.x ?? "",
    youtube: user?.youtube ?? "",
    twitch: user?.twitch ?? "",
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);
  const [referralStats, setReferralStats] = useState<{
    myCode: string | null;
    totalReferrals: number;
    completedReferrals: number;
    pendingReferrals: number;
    usedCode: boolean;
    myReferralCompleted: boolean;
    bonusActive: boolean;
    bonusUntil: string | null;
    paidMatchesPlayed: number;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (profileOpen) {
      setProfileForm({
        name: user?.name ?? "",
        handle: user?.handle ?? "",
        avatar: user?.avatar ?? "🎮",
        instagram: user?.instagram ?? "",
        discord: user?.discord ?? "",
        x: user?.x ?? "",
        youtube: user?.youtube ?? "",
        twitch: user?.twitch ?? "",
      });
    }
  }, [profileOpen]);

  useEffect(() => {
    if (user?.role === "player") {
      customFetch<typeof referralStats>("/api/referral/stats")
        .then(setReferralStats)
        .catch(() => {});
    }
  }, [user?.id]);

  const handleCopyCode = () => {
    if (referralStats?.myCode) {
      navigator.clipboard.writeText(referralStats.myCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleShareLink = () => {
    if (referralStats?.myCode) {
      const link = `${window.location.origin}/auth?ref=${referralStats.myCode}`;
      navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  const handleDeleteMember = async (memberId: number) => {
    try {
      await customFetch(`/api/users/me/squad/${memberId}`, { method: "DELETE" });
      refetchSquad();
      toast({ title: "Member removed" });
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" });
    }
  };

  const handleAddMember = async () => {
    if (!squadForm.name || !squadForm.uid) return;
    try {
      await addSquadMember({ data: squadForm });
      refetchSquad();
      setSquadForm({ name: "", uid: "" });
      toast({ title: "Squad member added!" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };


  const handleUpdateProfile = async () => {
    try {
      await updateProfile({ data: profileForm });
      await refreshUser();
      setProfileOpen(false);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  if (!user) return null;

  return (
    <AppLayout title="My Profile">
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <AvatarDisplay avatar={user.avatar} className="w-16 h-16 rounded-2xl text-3xl" />
              <div>
                <h2 className="text-lg font-bold">{user.name || "Player"}</h2>
                <p className="text-muted-foreground text-sm">@{user.handle || user.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user.role}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <RaiseComplaintDialog />
              <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm flex flex-col max-h-[90vh]">
                  <DialogHeader className="shrink-0"><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
                  <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                    <div className="space-y-2">
                      <Label>Avatar</Label>

                      {user.role === "host" ? (
                        (() => {
                          const gameAvatars = user.game ? HOST_AVATARS[user.game] : undefined;
                          return gameAvatars ? (
                            <div className="space-y-2">
                              <div className={`grid gap-2 ${gameAvatars.length >= 5 ? "grid-cols-5" : "grid-cols-4"}`}>
                                {gameAvatars.map((src) => (
                                  <button
                                    key={src}
                                    type="button"
                                    onClick={() => setProfileForm(f => ({ ...f, avatar: src }))}
                                    className={`rounded-xl overflow-hidden border-2 transition-all aspect-square ${profileForm.avatar === src ? "border-primary scale-105" : "border-transparent opacity-70 hover:opacity-100"}`}
                                  >
                                    <img src={src} alt="avatar" className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                              <div className="flex justify-center">
                                <AvatarDisplay avatar={profileForm.avatar} className="w-14 h-14 rounded-xl text-2xl" />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-2">
                              {AVATARS.map((avatar) => (
                                <button
                                  key={avatar}
                                  type="button"
                                  className={`text-2xl p-2.5 rounded-xl border transition-all ${profileForm.avatar === avatar ? "border-primary bg-primary/20" : "border-border bg-secondary/50 hover:border-border/80"}`}
                                  onClick={() => setProfileForm(f => ({ ...f, avatar }))}
                                >
                                  {avatar}
                                </button>
                              ))}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {AVATARS.map((avatar) => (
                            <button
                              key={avatar}
                              type="button"
                              className={`text-2xl p-2.5 rounded-xl border transition-all ${profileForm.avatar === avatar ? "border-primary bg-primary/20" : "border-border bg-secondary/50 hover:border-border/80"}`}
                              onClick={() => setProfileForm(f => ({ ...f, avatar }))}
                            >
                              {avatar}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Display Name</Label>
                      <Input value={profileForm.name} onChange={(e) => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Handle</Label>
                      <Input value={profileForm.handle} onChange={(e) => setProfileForm(f => ({ ...f, handle: e.target.value.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, "") }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Social Links</Label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm w-20 shrink-0 text-muted-foreground">Instagram</span>
                          <Input
                            placeholder="username"
                            value={profileForm.instagram}
                            onChange={(e) => setProfileForm(f => ({ ...f, instagram: e.target.value }))}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm w-20 shrink-0 text-muted-foreground">Discord</span>
                          <Input
                            placeholder="username"
                            value={profileForm.discord}
                            onChange={(e) => setProfileForm(f => ({ ...f, discord: e.target.value }))}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm w-20 shrink-0 text-muted-foreground">X</span>
                          <Input
                            placeholder="username"
                            value={profileForm.x}
                            onChange={(e) => setProfileForm(f => ({ ...f, x: e.target.value }))}
                          />
                        </div>
                        {(user.role === "host" || user.role === "admin") && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm w-20 shrink-0 text-muted-foreground">YouTube</span>
                              <Input
                                placeholder="channel name"
                                value={profileForm.youtube}
                                onChange={(e) => setProfileForm(f => ({ ...f, youtube: e.target.value }))}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleUpdateProfile} disabled={isUpdating}>
                      {isUpdating ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{user.followersCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Followers</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{user.followingCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Following</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg text-primary"><GoldCoin amount={user.balance.toFixed(0)} /></div>
              <div className="text-xs text-muted-foreground">Balance</div>
            </div>
          </div>

          {user.game && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-primary/15 text-primary border border-primary/30 rounded-full px-3 py-1">
                🎮 {user.game} {user.role === "host" ? "Host" : "Player"}
              </span>
              {user.handle && (
                <span className="text-xs text-muted-foreground">IGN: <span className="text-foreground font-medium">{user.handle}</span></span>
              )}
            </div>
          )}
          <SocialLinksDisplay instagram={user.instagram} discord={user.discord} x={user.x} youtube={user.youtube} twitch={user.twitch} />
        </div>

        {user.role === "host" && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Swords className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">My Matches</h3>
            </div>
            {matchesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : (
              <Tabs defaultValue="active">
                <TabsList className="w-full mb-3">
                  <TabsTrigger value="active" className="flex-1">
                    Active ({myMatches?.participated.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">
                    History ({myMatches?.history.length ?? 0})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="active">
                  {myMatches?.participated.length ? (
                    <div className="flex flex-col gap-2">
                      {myMatches.participated.map((m) => <MatchCard key={m.id} match={m} />)}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="text-3xl mb-2">🎮</div>
                      <p className="text-sm">No active matches</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="history">
                  {myMatches?.history.length ? (
                    <div className="flex flex-col gap-2">
                      {myMatches.history.map((m) => <MatchCard key={m.id} match={m} />)}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="text-3xl mb-2">📜</div>
                      <p className="text-sm">No match history</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}

        {user.role === "player" && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">My Squad</h3>
                <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                  {squad?.length ?? 0}/6
                </span>
              </div>
              {(squad?.length ?? 0) < 6 ? (
                <Dialog open={squadOpen} onOpenChange={setSquadOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Add Squad Member</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Player Name / IGN</Label>
                        <Input value={squadForm.name} onChange={(e) => setSquadForm(f => ({ ...f, name: e.target.value }))} placeholder="IGN" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Game UID</Label>
                        <Input value={squadForm.uid} onChange={(e) => setSquadForm(f => ({ ...f, uid: e.target.value }))} placeholder="UID" />
                      </div>
                      <Button className="w-full" onClick={handleAddMember} disabled={isAdding || !squadForm.name || !squadForm.uid}>
                        {isAdding ? "Adding..." : "Add Member"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <span className="text-xs text-muted-foreground">Squad Full</span>
              )}
            </div>
            {squad && squad.length > 0 ? (
              <div className="space-y-2">
                {squad.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.uid}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteMember(m.id!)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No squad members yet</p>
            )}
          </div>
        )}

        {user.role === "player" && referralStats && (
          <div className="bg-card border border-card-border rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Referral</h3>
              {referralStats.bonusActive && (
                <span className="text-[10px] font-semibold bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
                  +1 bonus active
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Your referral code</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-secondary/60 rounded-xl px-3 py-2 font-mono text-sm font-semibold tracking-wider text-primary">
                  {referralStats.myCode ?? "Loading..."}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleCopyCode}
                  disabled={!referralStats.myCode}
                >
                  {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 mt-1"
                onClick={handleShareLink}
                disabled={!referralStats.myCode}
              >
                {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link className="w-3.5 h-3.5" />}
                {linkCopied ? "Link Copied!" : "Copy Referral Link"}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="font-bold text-base">{referralStats.totalReferrals}</div>
                <div className="text-[10px] text-muted-foreground">Total</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="font-bold text-base text-green-400">{referralStats.completedReferrals}</div>
                <div className="text-[10px] text-muted-foreground">Completed</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="font-bold text-base text-yellow-400">{referralStats.pendingReferrals}</div>
                <div className="text-[10px] text-muted-foreground">Pending</div>
              </div>
            </div>

            {referralStats.bonusActive && referralStats.bonusUntil && (
              <div className="bg-green-500/10 border border-green-500/25 rounded-xl px-3 py-2 text-xs text-green-400">
                🎁 +1 silver coin daily bonus active until {referralStats.bonusUntil}
              </div>
            )}


            {referralStats.usedCode && !referralStats.myReferralCompleted && (
              <div className="bg-secondary/40 rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Referral in progress — play {Math.max(0, 5 - referralStats.paidMatchesPlayed)} more paid match{Math.max(0, 5 - referralStats.paidMatchesPlayed) !== 1 ? "es" : ""} to unlock your bonus.
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PublicProfile({ handle }: { handle: string }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading, refetch } = useGetUserProfile(handle);
  const { mutateAsync: follow } = useFollowUser();
  const { mutateAsync: unfollow } = useUnfollowUser();
  const [hostGroup, setHostGroup] = useState<{ id: number; name: string; avatar: string; memberCount: number; isPublic: boolean } | null>(null);

  useEffect(() => {
    if (profile?.role === "host" && profile.id) {
      customFetch<{ id: number; name: string; avatar: string; memberCount: number; isPublic: boolean } | null>(
        `/api/groups/by-host/${profile.id}`
      ).then(setHostGroup).catch(() => {});
    }
  }, [profile?.id, profile?.role]);

  const handleFollow = async () => {
    try {
      if (profile?.isFollowing) {
        await unfollow({ handle });
      } else {
        await follow({ handle });
      }
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <AppLayout showBack backHref="/explore" title="Profile">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout showBack backHref="/explore" title="Profile">
        <div className="text-center py-16 text-muted-foreground">User not found</div>
      </AppLayout>
    );
  }

  const isOwnProfile = currentUser?.handle === handle;

  return (
    <AppLayout showBack backHref="/explore" title={`@${handle}`}>
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <AvatarDisplay avatar={profile.avatar} className="w-16 h-16 rounded-2xl text-3xl" />
              <div>
                <h2 className="text-lg font-bold">{profile.name || `@${handle}`}</h2>
                <p className="text-muted-foreground text-sm">@{profile.handle}</p>
                {profile.role === "admin" ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">Administrator</span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary border border-primary/25 rounded-full px-2.5 py-0.5 mt-0.5">
                    🎮 {(profile as any).game ? `${(profile as any).game} ${profile.role === "host" ? "Host" : "Player"}` : profile.role === "host" ? "Host" : "Player"}
                  </span>
                )}
              </div>
            </div>
            {!isOwnProfile && currentUser && (
              <div className="flex gap-2">
                {canChat(currentUser.role, profile.role) && (
                  <Link href={`/chat/${profile.id}`}>
                    <Button variant="outline" size="sm" className="gap-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                      Message
                    </Button>
                  </Link>
                )}
                <Button
                  variant={profile.isFollowing ? "outline" : "default"}
                  size="sm"
                  onClick={handleFollow}
                >
                  {profile.isFollowing ? "Unfollow" : "Follow"}
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{profile.followersCount}</div>
              <div className="text-xs text-muted-foreground">Followers</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{profile.followingCount}</div>
              <div className="text-xs text-muted-foreground">Following</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{profile.matchesCount}</div>
              <div className="text-xs text-muted-foreground">Matches</div>
            </div>
          </div>

          {(profile as any).game && (
            <div className="mt-3">
              <span className="flex items-center gap-1.5 w-fit text-xs font-semibold bg-primary/15 text-primary border border-primary/30 rounded-full px-3 py-1">
                🎮 {(profile as any).game} {profile.role === "host" ? "Host" : "Player"}
              </span>
            </div>
          )}
          <SocialLinksDisplay
            instagram={(profile as any).instagram}
            discord={(profile as any).discord}
            x={(profile as any).x}
            youtube={(profile as any).youtube}
            twitch={(profile as any).twitch}
          />
        </div>

        {/* Host Group Card */}
        {profile.role === "host" && hostGroup && (
          <Link href={`/chat/group/${hostGroup.id}`}>
            <div className={`bg-card border rounded-2xl p-4 cursor-pointer hover:bg-secondary/30 transition-all ${hostGroup.isPublic ? "border-blue-500/20" : "border-border"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${hostGroup.isPublic ? "bg-blue-500/20" : "bg-secondary"}`}>
                  {hostGroup.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Crown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <p className="text-sm font-semibold truncate">{hostGroup.name}</p>
                    {!hostGroup.isPublic && (
                      <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0">🔒 Private</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hostGroup.memberCount} member{hostGroup.memberCount !== 1 ? "s" : ""} · {hostGroup.isPublic ? "Public" : "Private"} broadcast group
                  </p>
                </div>
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>
          </Link>
        )}

        {(profile.upcomingMatches.length > 0 || profile.activeMatches.length > 0) && (
          <div className="space-y-5">
            {profile.activeMatches.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Live / Active</h3>
                <div className="flex flex-col gap-2">
                  {profile.activeMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            )}
            {profile.upcomingMatches.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Upcoming</h3>
                <div className="flex flex-col gap-2">
                  {profile.upcomingMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function ProfilePage() {
  const [, params] = useRoute("/profile/:handle");
  const { user } = useAuth();

  if (params?.handle) {
    if (user?.handle === params.handle) {
      return <OwnProfile />;
    }
    return <PublicProfile handle={params.handle} />;
  }

  return <OwnProfile />;
}
