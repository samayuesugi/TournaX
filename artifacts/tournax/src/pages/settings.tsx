import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useUpdateMyProfile, useGetMe, customFetch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin, SilverCoin } from "@/components/ui/Coins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, Settings, Flag, ShoppingBag, Gift, Link as LinkIcon,
  Copy, Check, User, Mail, ChevronRight, Shield, FileText,
  Scroll, CalendarCheck, Gamepad2, Coins, Trophy, UserPlus, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HOST_AVATARS, isImageAvatar, resolveAvatarSrc } from "@/lib/host-avatars";
import { getFrameClass, getBadgeEmoji, getHandleColorClass } from "@/lib/cosmetics";

const AVATARS = ["🎮", "🔥", "⚡", "🏆", "💀", "🎯", "🦊", "🐺", "🦁", "🐯", "🦅", "🐉", "🎭", "🗡️", "🛡️", "💎"];

const COMPLAINT_TOPICS = [
  { id: "Withdrawal Issue", label: "Withdrawal Issue", icon: "💸" },
  { id: "Add Balance Issue", label: "Add Balance Issue", icon: "💳" },
  { id: "Bugs", label: "Bugs / Errors", icon: "🐛" },
  { id: "Host Issues", label: "Host Issues", icon: "🛡️" },
  { id: "Other", label: "Other", icon: "📋" },
];

type DailyTasksData = {
  inviteClaimed: boolean;
  loginClaimed: boolean;
  freeMatchesToday: number;
  freeMatchesClaimed: boolean;
  paidMatchesToday: number;
  paidMatchesClaimed: boolean;
  tournamentWinsToday: number;
  tournamentWinsClaimed: boolean;
};

function QuestTask({ icon: Icon, title, desc, reward, progress, total, claimed, color = "primary" }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  reward: string;
  progress: number;
  total: number;
  claimed: boolean;
  color?: "primary" | "gold" | "silver";
}) {
  const pct = Math.min(100, (progress / total) * 100);
  const barColor = claimed
    ? "bg-green-500"
    : color === "gold"
    ? "bg-amber-400"
    : color === "silver"
    ? "bg-slate-400"
    : "bg-primary";

  return (
    <div className={cn(
      "rounded-2xl p-4 border transition-all",
      claimed
        ? "bg-green-500/5 border-green-500/20"
        : pct > 0
        ? "bg-primary/5 border-primary/20"
        : "bg-card border-card-border"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
          claimed ? "bg-green-500/15" : pct > 0 ? "bg-primary/15" : "bg-secondary"
        )}>
          {claimed
            ? <CheckCircle2 className="w-6 h-6 text-green-400" />
            : <Icon className={cn("w-6 h-6", color === "gold" ? "text-amber-400" : color === "silver" ? "text-slate-300" : "text-primary")} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className={cn(
              "text-sm font-semibold leading-tight",
              claimed ? "text-green-400" : "text-foreground"
            )}>{title}</p>
            <span className={cn(
              "text-xs font-bold shrink-0 px-2 py-0.5 rounded-full",
              claimed
                ? "bg-green-500/20 text-green-400"
                : color === "gold"
                ? "bg-amber-400/20 text-amber-400"
                : "bg-slate-400/20 text-slate-300"
            )}>
              {claimed ? "Done!" : reward}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", barColor)}
              style={{ width: `${claimed ? 100 : pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-muted-foreground">
              {claimed ? "Completed" : `${progress} / ${total}`}
            </p>
            {!claimed && total > 1 && (
              <p className="text-[10px] text-muted-foreground">{Math.round(pct)}%</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarDisplay({ avatar, className }: { avatar?: string | null; className?: string }) {
  if (!avatar) return <div className={cn("flex items-center justify-center bg-secondary text-2xl", className)}>🎮</div>;
  if (isImageAvatar(avatar)) {
    const src = resolveAvatarSrc(avatar);
    return <img src={src} alt="avatar" className={cn("object-cover", className)} />;
  }
  return <div className={cn("flex items-center justify-center bg-secondary", className)}>{avatar}</div>;
}

function RaiseComplaintDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [hostHandle, setHostHandle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => { setTopic(""); setDescription(""); setHostHandle(""); };

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
      toast({ title: "Failed to submit", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Flag className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-sm font-medium">Raise a Complaint</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
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
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border bg-secondary/50 text-muted-foreground hover:border-destructive/40"
                  )}
                >
                  <span>{t.icon}</span>
                  <span className="leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          {topic === "Host Issues" && (
            <div className="space-y-1.5">
              <Label>Host Handle</Label>
              <Input
                placeholder="@handle"
                value={hostHandle}
                onChange={(e) => setHostHandle(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe your issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
              rows={4}
            />
          </div>
          <Button
            className="w-full"
            variant="destructive"
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

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateMyProfile();

  const [profileOpen, setProfileOpen] = useState(false);
  const [availableGames, setAvailableGames] = useState<{ id: number; name: string }[]>([]);
  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? "",
    handle: user?.handle ?? "",
    avatar: user?.avatar ?? "🎮",
    instagram: user?.instagram ?? "",
    discord: user?.discord ?? "",
    x: user?.x ?? "",
    youtube: user?.youtube ?? "",
    twitch: user?.twitch ?? "",
    game: (user as any)?.game ?? "",
    gameUid: (user as any)?.gameUid ?? "",
    isEsportsPlayer: Boolean((user as any)?.isEsportsPlayer),
  });

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
  const [dailyTasks, setDailyTasks] = useState<DailyTasksData | null>(null);

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
        game: (user as any)?.game ?? "",
        gameUid: (user as any)?.gameUid ?? "",
        isEsportsPlayer: Boolean((user as any)?.isEsportsPlayer),
      });
      if (user?.role === "player" && availableGames.length === 0) {
        customFetch<{ id: number; name: string }[]>("/api/games")
          .then(setAvailableGames)
          .catch(() => {});
      }
    }
  }, [profileOpen]);

  useEffect(() => {
    if (user?.role === "player") {
      customFetch<typeof referralStats>("/api/referral/stats")
        .then(setReferralStats)
        .catch(() => {});
      customFetch<DailyTasksData>("/api/auth/daily-tasks")
        .then(setDailyTasks)
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

  const handleShareLink = async () => {
    if (referralStats?.myCode) {
      const link = `${window.location.origin}/auth?ref=${referralStats.myCode}`;
      const name = user?.name ?? "A friend";
      const message =
        `${name} has invited you to TournaX! 🎮\n\n` +
        `Join real-money gaming tournaments and win real rewards — ` +
        `BGMI, Free Fire, Valorant & more!\n\n` +
        `Use my referral code when signing up:\n` +
        `🎟️ *${referralStats.myCode}*\n` +
        `Sign up here 👉 ${link}\n\n` +
        `Let's compete together! 🏆🔥`;
      if (navigator.share) {
        try { await navigator.share({ title: "Join TournaX!", text: message }); return; } catch {}
      }
      try { await navigator.clipboard.writeText(message); } catch {
        const ta = document.createElement("textarea");
        ta.value = message; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await updateProfile({ data: profileForm });
      await refreshUser();
      setProfileOpen(false);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  if (!user) return null;

  return (
    <AppLayout showBack backHref="/profile" title="Settings">
      <div className="space-y-4 pb-6">

        {/* Account Info */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Account</p>
          </div>
          <div className="flex items-center gap-3 px-4 pb-4">
            <AvatarDisplay
              avatar={user.avatar}
              className={cn("w-14 h-14 rounded-2xl text-2xl shrink-0", getFrameClass((user as any).equippedFrame))}
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base flex items-center gap-1.5">
                {user.name || "Player"}
                {getBadgeEmoji((user as any).equippedBadge) && (
                  <span className="text-sm">{getBadgeEmoji((user as any).equippedBadge)}</span>
                )}
              </div>
              <p className={cn("text-sm truncate", getHandleColorClass((user as any).equippedHandleColor) ?? "text-muted-foreground")}>
                @{user.handle || user.email}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
            </div>
          </div>
          <div className="border-t border-border">
            <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Settings className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium">Edit Profile</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
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
                  {user.role === "player" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Game Settings</Label>
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <Label>Selected Game</Label>
                          <Select value={profileForm.game} onValueChange={(val) => setProfileForm(f => ({ ...f, game: val }))}>
                            <SelectTrigger><SelectValue placeholder="Select a game" /></SelectTrigger>
                            <SelectContent>
                              {availableGames.map((g) => (
                                <SelectItem key={g.id} value={g.name}>🎮 {g.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Game UID</Label>
                          <Input
                            placeholder="Your in-game UID"
                            value={profileForm.gameUid}
                            onChange={(e) => setProfileForm(f => ({ ...f, gameUid: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {user.role === "player" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Account Type</Label>
                      <button
                        type="button"
                        onClick={() => setProfileForm(f => ({ ...f, isEsportsPlayer: !f.isEsportsPlayer }))}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                          profileForm.isEsportsPlayer
                            ? "bg-yellow-500/10 border-yellow-500/40"
                            : "bg-secondary/50 border-border"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">🎖️</span>
                          <div className="text-left">
                            <p className={cn("text-sm font-semibold", profileForm.isEsportsPlayer ? "text-yellow-400" : "text-foreground")}>
                              Esports Player
                            </p>
                            <p className="text-xs text-muted-foreground">Unlocks Esports category on home page</p>
                          </div>
                        </div>
                        <div className={cn(
                          "w-11 h-6 rounded-full transition-all relative shrink-0",
                          profileForm.isEsportsPlayer ? "bg-yellow-500" : "bg-border"
                        )}>
                          <div className={cn(
                            "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                            profileForm.isEsportsPlayer ? "left-6" : "left-1"
                          )} />
                        </div>
                      </button>
                      <p className="text-xs text-muted-foreground px-1">
                        Like Instagram's Professional account — switch to Esports Player to access competitive tournament categories.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Social Links</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20 shrink-0 text-muted-foreground">Instagram</span>
                        <Input placeholder="username" value={profileForm.instagram} onChange={(e) => setProfileForm(f => ({ ...f, instagram: e.target.value }))} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20 shrink-0 text-muted-foreground">Discord</span>
                        <Input placeholder="username" value={profileForm.discord} onChange={(e) => setProfileForm(f => ({ ...f, discord: e.target.value }))} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20 shrink-0 text-muted-foreground">X</span>
                        <Input placeholder="username" value={profileForm.x} onChange={(e) => setProfileForm(f => ({ ...f, x: e.target.value }))} />
                      </div>
                      {(user.role === "host" || user.role === "admin") && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm w-20 shrink-0 text-muted-foreground">YouTube</span>
                          <Input placeholder="channel name" value={profileForm.youtube} onChange={(e) => setProfileForm(f => ({ ...f, youtube: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleUpdateProfile} disabled={isUpdating}>
                    {isUpdating ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Quest (Daily Tasks) — players only */}
        {user.role === "player" && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">Quest</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Complete tasks to earn rewards</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-semibold text-primary">
                  {[dailyTasks?.inviteClaimed, dailyTasks?.loginClaimed, dailyTasks?.freeMatchesClaimed, dailyTasks?.paidMatchesClaimed, dailyTasks?.tournamentWinsClaimed].filter(Boolean).length} / 5
                </span>
                <span className="text-[10px] text-muted-foreground">completed</span>
              </div>
            </div>
            <div className="space-y-3">
              <QuestTask icon={CalendarCheck} title="Daily Login" desc="Just open the app every day" reward="+10 Silver" progress={dailyTasks?.loginClaimed ? 1 : 0} total={1} claimed={dailyTasks?.loginClaimed ?? false} color="silver" />
              <QuestTask icon={Gamepad2} title="Play 3 Free Matches" desc="Join any free tournament" reward="+10 Silver" progress={dailyTasks?.freeMatchesToday ?? 0} total={3} claimed={dailyTasks?.freeMatchesClaimed ?? false} color="silver" />
              <QuestTask icon={Coins} title="Play 3 Paid Matches" desc="Join any paid tournament" reward="+10 Silver" progress={dailyTasks?.paidMatchesToday ?? 0} total={3} claimed={dailyTasks?.paidMatchesClaimed ?? false} color="silver" />
              <QuestTask icon={Trophy} title="Win 5 Tournaments" desc="Win 5 paid tournaments today" reward="+10 Silver" progress={dailyTasks?.tournamentWinsToday ?? 0} total={5} claimed={dailyTasks?.tournamentWinsClaimed ?? false} color="silver" />
              <QuestTask icon={UserPlus} title="Invite a Friend" desc="Someone must sign up using your referral code" reward="+10 Silver" progress={dailyTasks?.inviteClaimed ? 1 : 0} total={1} claimed={dailyTasks?.inviteClaimed ?? false} color="silver" />
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">All tasks reset every midnight</p>
          </div>
        )}

        {/* Referral — players only */}
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
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleCopyCode} disabled={!referralStats.myCode}>
                  {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <Button variant="outline" size="sm" className="w-full gap-2 mt-1" onClick={handleShareLink} disabled={!referralStats.myCode}>
                {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <LinkIcon className="w-3.5 h-3.5" />}
                {linkCopied ? "Copied!" : "Share Referral"}
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
                🎁 +1 Gold Coin bonus on Win 3 Matches task active until {referralStats.bonusUntil}
              </div>
            )}
            <div className="bg-secondary/40 rounded-xl px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
              <p className="text-xs text-muted-foreground">Share your code → Friend registers → Friend plays 5 paid matches → You get <span className="text-amber-400 font-semibold">3 Gold Coins</span></p>
              <p className="text-xs text-muted-foreground">After referral completes, your friend gets <span className="text-green-400 font-semibold">+1 Gold Coin bonus</span> on the "Win 3 Matches" daily task for 5 days</p>
            </div>
            {referralStats.usedCode && !referralStats.myReferralCompleted && (
              <div className="bg-secondary/40 rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Referral in progress — play {Math.max(0, 5 - referralStats.paidMatchesPlayed)} more paid match{Math.max(0, 5 - referralStats.paidMatchesPlayed) !== 1 ? "es" : ""} to unlock your bonus.
              </div>
            )}
          </div>
        )}

        {/* More options */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">More</p>
          </div>
          {(user.role === "player" || user.role === "host") && (
            <Link href="/store">
              <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-violet-400" />
                  </div>
                  <span className="text-sm font-medium">Cosmetics Store</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </Link>
          )}
          <div className="border-t border-border">
            <RaiseComplaintDialog />
          </div>
          <div className="border-t border-border">
            <button
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors"
              onClick={() => {}}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium">Terms & Policies</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Terms & Policies content (static) */}
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Scroll className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Terms & Policies</h3>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground">1. Eligibility</p>
            <p>You must be 18 years or older to participate in paid tournaments. By using TournaX, you agree to these terms.</p>
            <p className="font-semibold text-foreground">2. Fair Play</p>
            <p>Cheating, hacking, or using unauthorized tools is strictly prohibited and will result in a permanent ban.</p>
            <p className="font-semibold text-foreground">3. Payments & Withdrawals</p>
            <p>All transactions are final. Withdrawals are processed within 24-48 hours. Minimum withdrawal is 10 Gold Coins.</p>
            <p className="font-semibold text-foreground">4. Disputes</p>
            <p>Raise a complaint through the app for any issues. Our team reviews all disputes within 48 hours.</p>
            <p className="font-semibold text-foreground">5. Privacy</p>
            <p>We collect only the data required to operate TournaX. We do not sell your personal information to third parties.</p>
          </div>
        </div>

        {/* Logout */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <button
            className="flex items-center gap-3 w-full px-4 py-4 hover:bg-destructive/5 transition-colors"
            onClick={handleLogout}
          >
            <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-destructive" />
            </div>
            <span className="text-sm font-medium text-destructive">Log Out</span>
          </button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/50">TournaX v1.0 · All rights reserved</p>
      </div>
    </AppLayout>
  );
}
