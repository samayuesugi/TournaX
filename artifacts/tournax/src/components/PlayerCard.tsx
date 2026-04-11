import { useRef, useState } from "react";
import { domToPng } from "modern-screenshot";
import { Download, Share2, Loader2, ShieldCheck, Trophy, Sword } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { isImageAvatar, resolveAvatarSrc } from "@/lib/host-avatars";
import { getFrameClass, getBadgeEmoji } from "@/lib/cosmetics";

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; gradient: string }> = {
  "Risky":    { label: "Risky",    color: "text-red-400",    bg: "bg-red-500/20",    border: "border-red-500/40",    gradient: "from-red-900/80 via-red-950/90 to-black" },
  "Beginner": { label: "Beginner", color: "text-slate-300",  bg: "bg-slate-500/20",  border: "border-slate-500/40",  gradient: "from-slate-800/80 via-slate-900/90 to-black" },
  "Trusted":  { label: "Trusted",  color: "text-blue-400",   bg: "bg-blue-500/20",   border: "border-blue-500/40",   gradient: "from-blue-900/80 via-blue-950/90 to-black" },
  "Veteran":  { label: "Veteran",  color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/40", gradient: "from-purple-900/80 via-purple-950/90 to-black" },
  "Elite":    { label: "Elite",    color: "text-amber-400",  bg: "bg-amber-500/20",  border: "border-amber-500/40",  gradient: "from-amber-900/80 via-amber-950/90 to-black" },
};

function AvatarDisplay({ avatar, className }: { avatar?: string | null; className?: string }) {
  if (!avatar) return <div className={cn("flex items-center justify-center bg-secondary text-2xl", className)}>🎮</div>;
  if (isImageAvatar(avatar)) return <img src={resolveAvatarSrc(avatar)} alt="avatar" className={cn("object-cover", className)} />;
  return <div className={cn("flex items-center justify-center bg-secondary", className)}>{avatar}</div>;
}

interface PlayerCardProps {
  user: {
    name?: string | null;
    handle?: string | null;
    avatar?: string | null;
    game?: string | null;
    gameIgn?: string | null;
    gameUid?: string | null;
    isGameVerified?: boolean;
    trustScore?: number;
    trustTier?: string;
    paidMatchesPlayed?: number;
    equippedFrame?: string | null;
    equippedBadge?: string | null;
    balance?: number | string;
    tournamentWins?: number;
  };
}

function PlayerCardVisual({ user, cardRef }: PlayerCardProps & { cardRef: React.RefObject<HTMLDivElement> }) {
  const tier = user.trustTier ?? "Trusted";
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG["Trusted"];
  const badge = getBadgeEmoji(user.equippedBadge);

  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-2xl"
      style={{
        width: 340,
        minHeight: 200,
        background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0a0f 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(139,92,246,0.12) 0%, transparent 60%)` }} />
      <div className="absolute inset-0 border border-white/10 rounded-2xl" />
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5" style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />

      <div className="relative p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn("w-16 h-16 rounded-2xl overflow-hidden shrink-0 border-2", tierCfg.border, getFrameClass(user.equippedFrame))}>
            <AvatarDisplay avatar={user.avatar} className="w-full h-full text-3xl" />
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-white font-bold text-base leading-tight truncate max-w-[140px]">
                {user.name || "Player"}
              </span>
              {badge && <span className="text-sm">{badge}</span>}
            </div>
            <p className="text-purple-300 text-xs font-medium mt-0.5">@{user.handle || "player"}</p>

            {user.game && (
              <span className="inline-block mt-1 text-[10px] font-semibold bg-white/10 text-white/70 rounded-full px-2 py-0.5">
                {user.game}
              </span>
            )}
          </div>

          <div className={cn("shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl border", tierCfg.bg, tierCfg.border)}>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", tierCfg.color)}>{tier}</span>
            <span className="text-white/80 text-xs font-bold">{user.trustScore ?? 500}</span>
          </div>
        </div>

        {(user.gameIgn || user.gameUid) && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              {user.isGameVerified && (
                <div className="flex items-center gap-1 text-green-400 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3" />
                  <span>VERIFIED</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {user.gameIgn && (
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-wider mb-0.5">IGN</p>
                  <p className="text-white text-xs font-semibold truncate">{user.gameIgn}</p>
                </div>
              )}
              {user.gameUid && (
                <div>
                  <p className="text-white/40 text-[9px] uppercase tracking-wider mb-0.5">UID</p>
                  <p className="text-white/80 text-xs font-mono">{user.gameUid}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/5 rounded-xl p-2.5 text-center">
            <p className="text-white font-bold text-sm">{user.paidMatchesPlayed ?? 0}</p>
            <p className="text-white/40 text-[9px] uppercase tracking-wider">Matches</p>
          </div>
          <div className="bg-white/5 rounded-xl p-2.5 text-center">
            <p className="text-white font-bold text-sm">{user.tournamentWins ?? 0}</p>
            <p className="text-white/40 text-[9px] uppercase tracking-wider">Wins</p>
          </div>
          <div className="bg-white/5 rounded-xl p-2.5 text-center">
            <p className="text-amber-400 font-bold text-sm">₹{Number(user.balance ?? 0).toFixed(0)}</p>
            <p className="text-white/40 text-[9px] uppercase tracking-wider">Earned</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-purple-500/30 flex items-center justify-center">
              <Trophy className="w-3 h-3 text-purple-300" />
            </div>
            <span className="text-white/60 text-[10px] font-bold tracking-wider">TOURNAX</span>
          </div>
          <span className="text-white/30 text-[9px]">tournax.app</span>
        </div>
      </div>
    </div>
  );
}

export function PlayerCardDialog({ open, onClose, user }: PlayerCardProps & { open: boolean; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null!);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await domToPng(cardRef.current, { scale: 3, backgroundColor: null });
      const link = document.createElement("a");
      link.download = `tournax-${user.handle || "player"}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast({ title: "Export failed", description: "Please try again", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await domToPng(cardRef.current, { scale: 3, backgroundColor: null });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `tournax-${user.handle || "player"}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${user.name || "Player"}'s TournaX Card`,
          text: `Check out my TournaX player card! 🔥 Trust Score: ${user.trustScore ?? 500} | ${user.paidMatchesPlayed ?? 0} matches played`,
        });
      } else {
        const text = `Check out my TournaX profile! 🔥\nTrust Score: ${user.trustScore ?? 500} (${user.trustTier ?? "Trusted"})\nMatches: ${user.paidMatchesPlayed ?? 0} | Wins: ${user.tournamentWins ?? 0}`;
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied to clipboard!", description: "Share it on WhatsApp, Discord or Instagram" });
      }
    } catch {
      toast({ title: "Share failed", description: "Please download and share manually", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Player Card
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 flex flex-col items-center gap-4">
          <PlayerCardVisual user={user} cardRef={cardRef} />

          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleDownload}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleShare}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Share
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Share your card on Instagram Story, WhatsApp or Discord
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
