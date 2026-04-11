import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useTheme } from "next-themes";
import {
  useUpdateMyProfile, customFetch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, Flag, ShoppingBag, Gift, Link as LinkIcon,
  Copy, Check, ChevronRight, FileText,
  Scroll, CalendarCheck, Gamepad2, Coins, Trophy, UserPlus, CheckCircle2, Medal,
  ShieldCheck, ShieldOff, Upload, Camera, Loader2, CheckCircle, XCircle, Languages, Sun, Moon, Monitor
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageAvatar, resolveAvatarSrc } from "@/lib/host-avatars";
import { getFrameClass, getBadgeEmoji, getHandleColorClass } from "@/lib/cosmetics";

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

function AvatarDisplay({ avatar, className }: { avatar?: string | null; className?: string }) {
  if (!avatar) return <div className={cn("flex items-center justify-center bg-secondary text-2xl", className)}>🎮</div>;
  if (isImageAvatar(avatar)) {
    return <img src={resolveAvatarSrc(avatar)} alt="avatar" className={cn("object-cover", className)} />;
  }
  return <div className={cn("flex items-center justify-center bg-secondary", className)}>{avatar}</div>;
}

function QuestTask({ icon: Icon, title, desc, reward, progress, total, claimed, color = "primary" }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; desc: string; reward: string;
  progress: number; total: number; claimed: boolean; color?: "primary" | "gold" | "silver";
}) {
  const pct = Math.min(100, (progress / total) * 100);
  const barColor = claimed ? "bg-green-500" : color === "gold" ? "bg-amber-400" : color === "silver" ? "bg-slate-400" : "bg-primary";
  return (
    <div className={cn("rounded-2xl p-4 border transition-all", claimed ? "bg-green-500/5 border-green-500/20" : pct > 0 ? "bg-primary/5 border-primary/20" : "bg-card border-card-border")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", claimed ? "bg-green-500/15" : pct > 0 ? "bg-primary/15" : "bg-secondary")}>
          {claimed ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <Icon className={cn("w-6 h-6", color === "gold" ? "text-amber-400" : color === "silver" ? "text-slate-300" : "text-primary")} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className={cn("text-sm font-semibold leading-tight", claimed ? "text-green-400" : "text-foreground")}>{title}</p>
            <span className={cn("text-xs font-bold shrink-0 px-2 py-0.5 rounded-full", claimed ? "bg-green-500/20 text-green-400" : color === "gold" ? "bg-amber-400/20 text-amber-400" : "bg-slate-400/20 text-slate-300")}>
              {claimed ? "Done!" : reward}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${claimed ? 100 : pct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-muted-foreground">{claimed ? "Completed" : `${progress} / ${total}`}</p>
            {!claimed && total > 1 && <p className="text-[10px] text-muted-foreground">{Math.round(pct)}%</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ icon: Icon, iconBg, iconColor, label, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; iconColor: string; label: string; onClick: () => void;
}) {
  return (
    <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors" onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", iconBg)}>
          <Icon className={cn("w-4 h-4", iconColor)} />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}

function QuestDialog({ open, onClose, dailyTasks }: { open: boolean; onClose: () => void; dailyTasks: DailyTasksData | null }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Quest</span>
            <span className="text-sm font-normal text-muted-foreground">
              {[dailyTasks?.inviteClaimed, dailyTasks?.loginClaimed, dailyTasks?.freeMatchesClaimed, dailyTasks?.paidMatchesClaimed, dailyTasks?.tournamentWinsClaimed].filter(Boolean).length} / 5 done
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3">
          <QuestTask icon={CalendarCheck} title="Daily Login" desc="Just open the app every day" reward="+10 Silver" progress={dailyTasks?.loginClaimed ? 1 : 0} total={1} claimed={dailyTasks?.loginClaimed ?? false} color="silver" />
          <QuestTask icon={Gamepad2} title="Play 3 Free Matches" desc="Join any free tournament" reward="+10 Silver" progress={dailyTasks?.freeMatchesToday ?? 0} total={3} claimed={dailyTasks?.freeMatchesClaimed ?? false} color="silver" />
          <QuestTask icon={Coins} title="Play 3 Paid Matches" desc="Join any paid tournament" reward="+10 Silver" progress={dailyTasks?.paidMatchesToday ?? 0} total={3} claimed={dailyTasks?.paidMatchesClaimed ?? false} color="silver" />
          <QuestTask icon={Trophy} title="Win 5 Tournaments" desc="Win 5 paid tournaments today" reward="+10 Silver" progress={dailyTasks?.tournamentWinsToday ?? 0} total={5} claimed={dailyTasks?.tournamentWinsClaimed ?? false} color="silver" />
          <QuestTask icon={UserPlus} title="Invite a Friend" desc="Someone must sign up using your referral code" reward="+10 Silver" progress={dailyTasks?.inviteClaimed ? 1 : 0} total={1} claimed={dailyTasks?.inviteClaimed ?? false} color="silver" />
          <p className="text-[10px] text-muted-foreground/60 text-center">All tasks reset every midnight</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReferralDialog({ open, onClose, referralStats, codeCopied, linkCopied, onCopyCode, onShareLink }: {
  open: boolean; onClose: () => void;
  referralStats: any; codeCopied: boolean; linkCopied: boolean;
  onCopyCode: () => void; onShareLink: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2"><Gift className="w-4 h-4 text-primary" /> Referral</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {referralStats?.bonusActive && (
            <span className="inline-flex text-[10px] font-semibold bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
              +1 bonus active
            </span>
          )}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Your referral code</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-secondary/60 rounded-xl px-3 py-2 font-mono text-sm font-semibold tracking-wider text-primary">
                {referralStats?.myCode ?? "Loading..."}
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onCopyCode} disabled={!referralStats?.myCode}>
                {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2 mt-1" onClick={onShareLink} disabled={!referralStats?.myCode}>
              {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <LinkIcon className="w-3.5 h-3.5" />}
              {linkCopied ? "Copied!" : "Share Referral"}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
              <div className="font-bold text-base">{referralStats?.totalReferrals ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
              <div className="font-bold text-base text-green-400">{referralStats?.completedReferrals ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Completed</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
              <div className="font-bold text-base text-yellow-400">{referralStats?.pendingReferrals ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Pending</div>
            </div>
          </div>
          {referralStats?.bonusActive && referralStats?.bonusUntil && (
            <div className="bg-green-500/10 border border-green-500/25 rounded-xl px-3 py-2 text-xs text-green-400">
              🎁 +1 Gold Coin bonus on Win 3 Matches task active until {referralStats.bonusUntil}
            </div>
          )}
          <div className="bg-secondary/40 rounded-xl px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
            <p className="text-xs text-muted-foreground">Share your code → Friend registers → Friend plays 5 paid matches → You get <span className="text-amber-400 font-semibold">3 Gold Coins</span></p>
          </div>
          {referralStats?.usedCode && !referralStats?.myReferralCompleted && (
            <div className="bg-secondary/40 rounded-xl px-3 py-2 text-xs text-muted-foreground">
              Referral in progress — play {Math.max(0, 5 - (referralStats?.paidMatchesPlayed ?? 0))} more paid match{Math.max(0, 5 - (referralStats?.paidMatchesPlayed ?? 0)) !== 1 ? "es" : ""} to unlock your bonus.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EsportsDialog({ open, onClose, user, squad, refreshUser }: {
  open: boolean; onClose: () => void; user: any; squad: any[]; refreshUser: () => Promise<void>;
}) {
  const { toast } = useToast();
  const { mutateAsync: updateProfile, isPending } = useUpdateMyProfile();
  const isEsports = Boolean(user?.isEsportsPlayer);
  const squadForGame = (squad ?? []).filter((m: any) => m.game === user?.game);
  const hasEnoughSquad = squadForGame.length >= 4;

  const handleToggle = async () => {
    if (!isEsports && !hasEnoughSquad) {
      toast({
        title: "Squad too small",
        description: `You need at least 4 squad members for ${user?.game || "your game"} to become an Esports Player. Add them on your profile page.`,
        variant: "destructive",
      });
      return;
    }
    try {
      await updateProfile({ data: { isEsportsPlayer: !isEsports } as any });
      await refreshUser();
      toast({ title: isEsports ? "Esports mode disabled" : "Esports Player activated!" });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Medal className="w-4 h-4 text-yellow-400" /> Esports Player
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esports Player mode unlocks the Esports tournament category on the home page — for competitive players who play with a full squad.
          </p>

          <div className={cn("rounded-xl p-3 border", isEsports ? "bg-yellow-500/10 border-yellow-500/30" : "bg-secondary/50 border-border")}>
            <div className="flex items-center justify-between">
              <div>
                <p className={cn("font-semibold text-sm", isEsports ? "text-yellow-400" : "text-foreground")}>
                  {isEsports ? "Active — Esports Player" : "Not activated"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user?.game ? `Game: ${user.game}` : "No game selected"}
                </p>
              </div>
              <div className={cn("w-11 h-6 rounded-full transition-all relative shrink-0", isEsports ? "bg-yellow-500" : "bg-border")}>
                <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isEsports ? "left-6" : "left-1")} />
              </div>
            </div>
          </div>

          {!isEsports && (
            <div className={cn("rounded-xl px-3 py-2 border text-xs", hasEnoughSquad ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-yellow-500/10 border-yellow-500/25 text-yellow-400")}>
              {hasEnoughSquad
                ? `Squad ready: ${squadForGame.length} members for ${user?.game}`
                : `Need 4+ squad members for ${user?.game || "your game"} (currently ${squadForGame.length}). Add them on your profile page.`
              }
            </div>
          )}

          <Button
            className="w-full"
            variant={isEsports ? "destructive" : "default"}
            onClick={handleToggle}
            disabled={isPending}
          >
            {isPending ? "Saving..." : isEsports ? "Disable Esports Mode" : "Activate Esports Player"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GameVerifyDialog({ open, onClose, user, refreshUser }: {
  open: boolean; onClose: () => void; user: any; refreshUser: () => Promise<void>;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"code" | "upload" | "verifying" | "done" | "error">("code");
  const [code, setCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (open && !user?.isGameVerified) {
      customFetch<any>("/api/users/me/verification-code")
        .then((data) => {
          setCode(data.code);
          if (data.isGameVerified) setStep("done");
        })
        .catch(() => toast({ title: "Error", description: "Could not load verification code", variant: "destructive" }));
    }
    if (open && user?.isGameVerified) {
      setStep("done");
    }
  }, [open, user?.isGameVerified]);

  const handleCopyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep("verifying");
    setErrorMsg(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type || "image/jpeg";
        try {
          const res = await customFetch<any>("/api/users/me/verify-game", {
            method: "POST",
            body: JSON.stringify({ imageBase64: base64, mimeType }),
          });
          setResult(res);
          setStep("done");
          await refreshUser();
          toast({ title: "Game Verified!", description: `IGN: ${res.gameIgn || "—"} · UID: ${res.gameUid || "—"}` });
        } catch (err: any) {
          setErrorMsg(err?.data?.error || "Verification failed. Try uploading a clearer screenshot.");
          setStep("error");
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setErrorMsg("Failed to read image. Please try again.");
      setStep("error");
    }
  };

  const handleClose = () => {
    if (step !== "verifying") {
      setStep("code");
      setErrorMsg(null);
      setResult(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Game Verification
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {step === "done" ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <p className="font-bold text-lg text-green-400">Verified!</p>
                <p className="text-sm text-muted-foreground">Your game account is verified</p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGN</span>
                  <span className="font-semibold">{user?.gameIgn || result?.gameIgn || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">UID</span>
                  <span className="font-semibold font-mono">{user?.gameUid || result?.gameUid || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Game</span>
                  <span className="font-semibold">{user?.game || "—"}</span>
                </div>
              </div>
              <Button className="w-full" onClick={handleClose}>Done</Button>
            </div>
          ) : step === "error" ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <XCircle className="w-7 h-7 text-red-400" />
                </div>
                <p className="font-semibold text-red-400">Verification Failed</p>
                <p className="text-xs text-muted-foreground">{errorMsg}</p>
              </div>
              <Button className="w-full" variant="outline" onClick={() => setStep("upload")}>
                Try Again
              </Button>
            </div>
          ) : step === "verifying" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="font-semibold">Analyzing screenshot...</p>
              <p className="text-xs text-muted-foreground">AI is reading your profile — please wait</p>
            </div>
          ) : step === "upload" ? (
            <div className="space-y-3">
              <div className="bg-primary/10 border border-primary/25 rounded-xl px-3 py-2.5 text-sm">
                <p className="font-semibold text-primary mb-1">Step 3: Upload Profile Screenshot</p>
                <p className="text-xs text-muted-foreground">Go to your game, take a screenshot of your profile page where your name with the code is clearly visible. Upload it here.</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm font-medium">Tap to upload screenshot</span>
                <span className="text-xs">JPG, PNG — max 10MB</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button variant="outline" className="w-full" onClick={() => setStep("code")}>Back</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">1</span>
                  Copy your unique verification code
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-secondary/60 rounded-xl px-3 py-2.5 font-mono text-lg font-bold tracking-widest text-primary text-center">
                    {code ?? "Loading..."}
                  </div>
                  <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={handleCopyCode} disabled={!code}>
                    {codeCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="font-semibold text-foreground mb-0.5">Add code to your in-game name</p>
                    <p>Open <span className="font-semibold">{user?.game || "your game"}</span> → Settings → Change Name</p>
                    <p className="mt-1">Example: <span className="text-primary font-mono font-semibold">DragonX {code ?? "#TX-XXXX"}</span></p>
                    <p className="mt-1 text-yellow-400">After saving, come back here to continue.</p>
                  </div>
                </div>
              </div>

              <Button className="w-full" disabled={!code} onClick={() => setStep("upload")}>
                <Camera className="w-4 h-4 mr-2" /> I've Added the Code — Continue
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                You can remove the code from your name after verification is complete.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TermsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2"><Scroll className="w-4 h-4" /> Terms & Policies</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3 text-xs text-muted-foreground leading-relaxed">
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
      </DialogContent>
    </Dialog>
  );
}

function ComplaintDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [hostHandle, setHostHandle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => { setTopic(""); setDescription(""); setHostHandle(""); };

  const handleSubmit = async () => {
    if (!topic || !description.trim()) { toast({ title: "Please select a topic and write a description", variant: "destructive" }); return; }
    if (topic === "Host Issues" && !hostHandle.trim()) { toast({ title: "Please enter the host's handle", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      await customFetch("/api/complaints", { method: "POST", body: JSON.stringify({ subject: topic, description: description.trim(), hostHandle: topic === "Host Issues" ? hostHandle.trim() : undefined }) });
      toast({ title: "Complaint submitted!", description: "Our team will review it shortly." });
      reset();
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2"><Flag className="w-4 h-4 text-destructive" /> Raise a Complaint</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          <div className="space-y-2">
            <Label>Topic</Label>
            <div className="grid grid-cols-2 gap-2">
              {COMPLAINT_TOPICS.map((t) => (
                <button key={t.id} type="button" onClick={() => { setTopic(t.id); if (t.id !== "Host Issues") setHostHandle(""); }}
                  className={cn("flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left", topic === t.id ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-secondary/50 text-muted-foreground hover:border-destructive/40")}>
                  <span>{t.icon}</span><span className="leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          {topic === "Host Issues" && (
            <div className="space-y-1.5">
              <Label>Host Handle</Label>
              <Input placeholder="@handle" value={hostHandle} onChange={(e) => setHostHandle(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="Describe your issue..." value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none" rows={4} />
          </div>
          <Button className="w-full" variant="destructive" onClick={handleSubmit} disabled={isSubmitting || !topic || !description.trim()}>
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
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [questOpen, setQuestOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [esportsOpen, setEsportsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [gameVerifyOpen, setGameVerifyOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const [referralStats, setReferralStats] = useState<any>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [dailyTasks, setDailyTasks] = useState<DailyTasksData | null>(null);
  const [squad, setSquad] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === "player") {
      customFetch<any>("/api/referral/stats").then(setReferralStats).catch(() => {});
      customFetch<DailyTasksData>("/api/auth/daily-tasks").then(setDailyTasks).catch(() => {});
      customFetch<any[]>("/api/users/me/squad").then(setSquad).catch(() => {});
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
      const message = `${name} has invited you to TournaX! 🎮\n\nJoin real-money gaming tournaments and win real rewards — BGMI, Free Fire, Valorant & more!\n\nUse my referral code when signing up:\n🎟️ *${referralStats.myCode}*\nSign up here 👉 ${link}\n\nLet's compete together! 🏆🔥`;
      if (navigator.share) { try { await navigator.share({ title: "Join TournaX!", text: message }); return; } catch {} }
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

  const handleLogout = async () => { await logout(); navigate("/auth"); };

  if (!user) return null;

  return (
    <AppLayout showBack backHref="/profile" title="Settings">
      <div className="space-y-4 pb-6">

        {/* Single unified settings card */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          {/* Account Info */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
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

          <div className="divide-y divide-border">
            {/* Player-only rows */}
            {user.role === "player" && (
              <>
                <SettingRow icon={Trophy} iconBg="bg-primary/15" iconColor="text-primary" label="Quest & Daily Tasks" onClick={() => setQuestOpen(true)} />
                <SettingRow icon={Gift} iconBg="bg-emerald-500/15" iconColor="text-emerald-400" label="Referral Program" onClick={() => setReferralOpen(true)} />
                <SettingRow icon={Medal} iconBg="bg-yellow-500/15" iconColor="text-yellow-400" label="Esports Player" onClick={() => setEsportsOpen(true)} />
                <button
                  className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors"
                  onClick={() => setGameVerifyOpen(true)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", (user as any).isGameVerified ? "bg-green-500/15" : "bg-blue-500/15")}>
                      <ShieldCheck className={cn("w-4 h-4", (user as any).isGameVerified ? "text-green-400" : "text-blue-400")} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">Game Verification</span>
                      {(user as any).isGameVerified
                        ? <span className="text-[10px] text-green-400 font-semibold">Verified ✓</span>
                        : <span className="text-[10px] text-muted-foreground">Verify your IGN & UID</span>
                      }
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </>
            )}

            {/* Store - for players and hosts */}
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

            <button
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors"
              onClick={() => setLanguageOpen(true)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <Languages className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">Language / भाषा</span>
                  <span className="text-[10px] text-muted-foreground">{language === "hi" ? "हिंदी" : "English"}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors"
              onClick={() => setThemeOpen(true)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  {theme === "light" ? (
                    <Sun className="w-4 h-4 text-violet-400" />
                  ) : theme === "dark" ? (
                    <Moon className="w-4 h-4 text-violet-400" />
                  ) : (
                    <Monitor className="w-4 h-4 text-violet-400" />
                  )}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">Theme / थीम</span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {theme === "system" ? "System Default" : theme === "light" ? "Light" : "Dark"}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <SettingRow icon={Flag} iconBg="bg-red-500/15" iconColor="text-red-400" label="Raise a Complaint" onClick={() => setComplaintOpen(true)} />
            <SettingRow icon={FileText} iconBg="bg-primary/15" iconColor="text-primary" label="Terms & Policies" onClick={() => setTermsOpen(true)} />

            {/* Logout */}
            <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-destructive/5 transition-colors" onClick={handleLogout}>
              <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center">
                <LogOut className="w-4 h-4 text-destructive" />
              </div>
              <span className="text-sm font-medium text-destructive">Log Out</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/50">TournaX v1.0 · All rights reserved</p>
      </div>

      <QuestDialog open={questOpen} onClose={() => setQuestOpen(false)} dailyTasks={dailyTasks} />
      <ReferralDialog
        open={referralOpen} onClose={() => setReferralOpen(false)}
        referralStats={referralStats} codeCopied={codeCopied} linkCopied={linkCopied}
        onCopyCode={handleCopyCode} onShareLink={handleShareLink}
      />
      <EsportsDialog open={esportsOpen} onClose={() => setEsportsOpen(false)} user={user} squad={squad} refreshUser={refreshUser} />
      <TermsDialog open={termsOpen} onClose={() => setTermsOpen(false)} />
      <ComplaintDialog open={complaintOpen} onClose={() => setComplaintOpen(false)} />
      <GameVerifyDialog open={gameVerifyOpen} onClose={() => setGameVerifyOpen(false)} user={user} refreshUser={refreshUser} />

      <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-violet-400" />
              Theme / थीम
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Choose how TournaX looks. System default follows your device settings.</p>
            {[
              { value: "system", label: "System Default", sub: "Follows your device setting", Icon: Monitor },
              { value: "light", label: "Light", sub: "Always light mode", Icon: Sun },
              { value: "dark", label: "Dark", sub: "Always dark mode", Icon: Moon },
            ].map(({ value, label, sub, Icon }) => (
              <button
                key={value}
                onClick={() => { setTheme(value); setThemeOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all text-left",
                  theme === value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                )}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", theme === value ? "bg-primary/20" : "bg-secondary")}>
                  <Icon className={cn("w-4 h-4", theme === value ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="flex-1">
                  <p className={cn("font-semibold text-sm", theme === value ? "text-primary" : "")}>{label}</p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
                {theme === value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={languageOpen} onOpenChange={setLanguageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-blue-400" />
              Language / भाषा
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Choose your preferred language for the app interface.</p>
            {[
              { code: "en", label: "English", sub: "English Interface" },
              { code: "hi", label: "हिंदी", sub: "Hindi Interface" },
            ].map(({ code, label, sub }) => (
              <button
                key={code}
                onClick={() => { setLanguage(code as "en" | "hi"); setLanguageOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all",
                  language === code
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/30 hover:border-primary/40"
                )}
              >
                <div className="text-left">
                  <p className={cn("font-semibold text-sm", language === code ? "text-primary" : "")}>{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
                {language === code && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
