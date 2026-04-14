import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";
import {
  useListMatches, useGoLive, useUpdateRoomCredentials, useDeleteMatch,
  useSubmitResult, useGetMatchPlayers,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Swords, Trophy, Zap, Radio, Key, Trash2, ChevronRight, Medal, AlertCircle, BarChart3, Download, ImagePlus, X, Camera, Clock, Users, UserX, ShieldCheck, Shield, BookTemplate, History, TrendingUp, CalendarDays, Share2, Flame } from "lucide-react";

const TEMPLATE_STORAGE_KEY = "tournax_match_templates";
const SCREENSHOT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MATCH_SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024;

function saveMatchAsTemplate(match: any) {
  const existing = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
  const template = {
    id: Date.now(),
    name: `${match.game} ${match.mode} – ${match.map || ""}`.trim(),
    game: match.game,
    mode: match.mode,
    map: match.map,
    entryFee: match.entryFee,
    slots: match.slots,
    teamSize: match.teamSize,
    winnersPercent: match.winnersPercent,
    hostPercent: match.hostPercent,
    savedAt: new Date().toISOString(),
  };
  existing.unshift(template);
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(existing.slice(0, 10)));
  return template;
}

function trustTierColor(tier: string) {
  if (tier === "platinum") return "text-cyan-400 border-cyan-400/40 bg-cyan-400/10";
  if (tier === "gold") return "text-amber-400 border-amber-400/40 bg-amber-400/10";
  if (tier === "silver") return "text-slate-300 border-slate-300/40 bg-slate-300/10";
  return "text-orange-400 border-orange-400/40 bg-orange-400/10";
}

function trustTierIcon(tier: string) {
  if (tier === "platinum") return "💎";
  if (tier === "gold") return "🥇";
  if (tier === "silver") return "🥈";
  return "🥉";
}

function EarningsBreakdownDialog({ matches }: { matches: any[] }) {
  const completedMatches = matches.filter((m) => m.status === "completed" && parseFloat(String(m.hostCut || 0)) > 0);
  const totalEarnings = completedMatches.reduce((sum, m) => sum + parseFloat(String(m.hostCut || 0)), 0);

  const handleExport = () => {
    const rows = [
      ["Match Code", "Game", "Mode", "Entry Fee", "Players", "Host Earnings", "Date"],
      ...completedMatches.map((m) => [
        m.code,
        m.game,
        m.mode,
        m.entryFee,
        m.filledSlots,
        parseFloat(String(m.hostCut || 0)).toFixed(2),
        new Date(m.startTime || m.createdAt).toLocaleDateString("en-IN"),
      ]),
      ["", "", "", "", "Total", totalEarnings.toFixed(2), ""],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tournax_earnings.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
          <BarChart3 className="w-3.5 h-3.5" /> Breakdown
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" /> Earnings Breakdown
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Earned</span>
            <GoldCoin amount={totalEarnings.toFixed(0)} className="font-bold text-accent text-base" />
          </div>

          {completedMatches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No earnings yet
            </div>
          ) : (
            <div className="space-y-2">
              {completedMatches.map((m) => (
                <div key={m.id} className="bg-secondary/50 rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{m.game} · {m.mode}</div>
                    <div className="text-xs text-muted-foreground font-mono">{m.code}</div>
                    <div className="text-xs text-muted-foreground">{m.filledSlots} players · {new Date(m.startTime || m.createdAt).toLocaleDateString("en-IN")}</div>
                  </div>
                  <GoldCoin amount={parseFloat(String(m.hostCut || 0)).toFixed(0)} className="font-bold text-green-400 text-sm shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
        {completedMatches.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs mt-2 shrink-0" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function statusColor(status: string) {
  if (status === "live") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "upcoming") return "bg-primary/20 text-primary border-primary/30";
  if (status === "completed") return "bg-muted text-muted-foreground border-border";
  return "bg-secondary text-muted-foreground border-border";
}

interface ShareLeaderboardEntry {
  rank: number;
  name: string;
  kills: number;
  reward: number;
}

interface MatchShareData {
  game: string;
  code: string;
  mode: string;
  hostName: string;
  hostHandle: string;
  prizePool: number;
  leaderboard: ShareLeaderboardEntry[];
}

const RANK_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function MatchShareCard({ data, cardRef }: { data: MatchShareData; cardRef: React.RefObject<HTMLDivElement | null> }) {
  const top3 = data.leaderboard.filter(e => e.rank <= 3).sort((a, b) => a.rank - b.rank);
  const rest = data.leaderboard.filter(e => e.rank > 3).sort((a, b) => a.rank - b.rank);
  const gameEmoji = data.game === "Free Fire" ? "🔥" : data.game === "BGMI" ? "🎯" : data.game === "COD Mobile" ? "💥" : "🎮";

  return (
    <div
      ref={cardRef}
      style={{
        width: 400,
        background: "linear-gradient(145deg, #0d0d1a 0%, #12072b 40%, #0a1628 100%)",
        borderRadius: 20,
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
      }}
    >
      {/* Glow orbs */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(124,58,237,0.18)", filter: "blur(40px)" }} />
      <div style={{ position: "absolute", bottom: 0, left: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(6,182,212,0.12)", filter: "blur(30px)" }} />

      {/* Header */}
      <div style={{ padding: "18px 20px 12px", background: "linear-gradient(180deg, rgba(124,58,237,0.25) 0%, transparent 100%)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #7c3aed, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff" }}>Tx</div>
            <div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>TournaX</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Compete · Win · Dominate</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>Match Code</div>
            <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>#{data.code}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>{gameEmoji}</span>
          <div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>{data.game}</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{data.mode} · Match Results</div>
          </div>
          <div style={{ marginLeft: "auto", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "4px 10px" }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: 1 }}>Prize Pool</div>
            <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 800 }}>₹{data.prizePool}</div>
          </div>
        </div>
      </div>

      {/* Podium (top 3) */}
      {top3.length > 0 && (
        <div style={{ padding: "14px 20px 10px", position: "relative", zIndex: 1 }}>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Top Players</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {top3.map((entry) => (
              <div key={entry.rank} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: entry.rank === 1
                  ? "linear-gradient(90deg, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.04) 100%)"
                  : entry.rank === 2
                  ? "linear-gradient(90deg, rgba(148,163,184,0.12) 0%, transparent 100%)"
                  : "linear-gradient(90deg, rgba(194,120,63,0.12) 0%, transparent 100%)",
                border: `1px solid ${entry.rank === 1 ? "rgba(251,191,36,0.25)" : entry.rank === 2 ? "rgba(148,163,184,0.15)" : "rgba(194,120,63,0.15)"}`,
                borderRadius: 10, padding: "8px 12px",
              }}>
                <span style={{ fontSize: 20, minWidth: 28 }}>{RANK_MEDALS[entry.rank]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>#{entry.rank} Place</div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#f97316", fontSize: 13, fontWeight: 800 }}>{entry.kills}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, textTransform: "uppercase", letterSpacing: 1 }}>Kills</div>
                  </div>
                  {entry.reward > 0 && (
                    <div style={{ textAlign: "center", background: "rgba(251,191,36,0.12)", borderRadius: 6, padding: "3px 8px" }}>
                      <div style={{ color: "#fbbf24", fontSize: 13, fontWeight: 800 }}>₹{entry.reward}</div>
                      <div style={{ color: "rgba(251,191,36,0.5)", fontSize: 8, textTransform: "uppercase" }}>Won</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rest of leaderboard */}
      {rest.length > 0 && (
        <div style={{ padding: "0 20px 10px", position: "relative", zIndex: 1 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            {rest.slice(0, 5).map((entry) => (
              <div key={entry.rank} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, minWidth: 20, textAlign: "center" }}>#{entry.rank}</span>
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
                <span style={{ color: "#f97316", fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: "right" }}>{entry.kills}K</span>
                {entry.reward > 0 && <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: "right" }}>₹{entry.reward}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "10px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", position: "relative", zIndex: 1 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>Hosted by</div>
          <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>@{data.hostHandle}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{data.hostName}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>Play on</div>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>TournaX</div>
          <div style={{ color: "rgba(124,58,237,0.8)", fontSize: 9 }}>tournax.app</div>
        </div>
      </div>
    </div>
  );
}

async function captureCardAsBlob(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/png");
  });
}

function SubmitResultDialog({ match, onAction }: { match: any; onAction: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [shareData, setShareData] = useState<MatchShareData | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: participants, isLoading } = useGetMatchPlayers(match.id, { query: { enabled: open } as any });
  const { mutateAsync: submitResult, isPending } = useSubmitResult();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ranks, setRanks] = useState<Record<number, string>>({});
  const [rewards, setRewards] = useState<Record<number, string>>({});
  const [kills, setKills] = useState<Record<number, string>>({});
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const prizePool = parseFloat(String(match.livePrizePool || 0));
  const totalRewarded = (participants || []).reduce((sum, p) => {
    const val = parseFloat(rewards[p.id] || "0");
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const remaining = prizePool - totalRewarded;
  const isOverBudget = totalRewarded > prizePool + 0.01;

  const validateScreenshotFile = (file: File): string | null => {
    if (!SCREENSHOT_MIME_TYPES.includes(file.type)) return "Upload JPG, PNG, or WebP screenshots only.";
    if (file.size > MATCH_SCREENSHOT_MAX_BYTES) return "Each screenshot must be 6MB or smaller.";
    return null;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const canAdd = Math.min(files.length, 5 - screenshots.length);
    if (canAdd <= 0) {
      toast({ title: "Maximum 5 screenshots allowed", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const newPaths: string[] = [];
      const newPreviews: string[] = [];
      for (let i = 0; i < canAdd; i++) {
        const file = files[i];
        const validationError = validateScreenshotFile(file);
        if (validationError) throw new Error(validationError);
        const preview = URL.createObjectURL(file);
        newPreviews.push(preview);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("context", "matchResult");
        const res = await fetch("/api/storage/uploads/file", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        newPaths.push(data.objectPath || "uploaded");
      }
      setScreenshots(prev => [...prev, ...newPaths]);
      setScreenshotPreviews(prev => [...prev, ...newPreviews]);
      toast({ title: `${canAdd} screenshot${canAdd > 1 ? "s" : ""} uploaded!` });
    } catch (err: any) {
      toast({ title: "Screenshot upload failed", description: err?.message || "Unsupported or unsafe file.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeScreenshot = (idx: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== idx));
    setScreenshotPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!participants || participants.length === 0) return;

    const results = participants.map((p) => ({
      participantId: p.id,
      rank: parseInt(ranks[p.id] || "0"),
      reward: parseFloat(rewards[p.id] || "0"),
      kills: parseInt(kills[p.id] || "0"),
    }));
    const invalid = results.find((r) => !r.rank || r.rank < 1);
    if (invalid) {
      toast({ title: "Enter a valid rank for all teams", variant: "destructive" });
      return;
    }
    if (isOverBudget) {
      toast({ title: "Total rewards exceed the prize pool", variant: "destructive" });
      return;
    }
    try {
      await submitResult({ id: match.id, data: { results, screenshotUrls: screenshots } as any });
      toast({ title: "Result submitted!", description: "Rewards have been distributed to winners." });
      const leaderboard: ShareLeaderboardEntry[] = (participants || []).map((p: any) => ({
        rank: parseInt(ranks[p.id] || "0"),
        name: p.teamName || p.players?.[0]?.ign || p.userName || "Player",
        kills: parseInt(kills[p.id] || "0"),
        reward: parseFloat(rewards[p.id] || "0"),
      })).filter((e: ShareLeaderboardEntry) => e.rank > 0).sort((a: ShareLeaderboardEntry, b: ShareLeaderboardEntry) => a.rank - b.rank);
      setShareData({
        game: match.game || "Game",
        code: match.code || "",
        mode: match.mode || "Squad",
        hostName: user?.name || "Host",
        hostHandle: (user as any)?.handle || (user as any)?.username || "host",
        prizePool: parseFloat(String(match.livePrizePool || 0)),
        leaderboard,
      });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to submit result", variant: "destructive" });
    }
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setRanks({});
      setRewards({});
      setKills({});
      setScreenshots([]);
      setScreenshotPreviews([]);
      setShareData(null);
      setSharing(false);
    }
  };

  const handleDownloadCard = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const blob = await captureCardAsBlob(cardRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tournax-result-${shareData?.code || "match"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Please screenshot the card manually.", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const handleShareCard = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const blob = await captureCardAsBlob(cardRef.current);
      const file = new File([blob], `tournax-result-${shareData?.code || "match"}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${shareData?.game} Match Results – TournaX`,
          text: `Check out the results from my ${shareData?.game} match on TournaX! 🏆 Play at tournax.app`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tournax-result-${shareData?.code || "match"}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Image downloaded!", description: "Share it on WhatsApp or any platform." });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "Share failed", description: "Image downloaded instead.", variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1 h-8 text-xs gap-1 bg-accent hover:bg-accent/90 text-accent-foreground">
          <Medal className="w-3.5 h-3.5" /> Result
        </Button>
      </DialogTrigger>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", shareData ? "max-w-[440px] p-0 bg-transparent border-0 shadow-none" : "max-w-sm")}>
        {shareData ? (
          <>
            <div className="sr-only"><DialogHeader><DialogTitle>Match Result Card</DialogTitle></DialogHeader></div>
            <div className="flex flex-col items-center gap-4 pb-2">
              <div className="w-full flex items-center justify-between px-1 pt-1">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Result Published!</span>
                </div>
                <span className="text-xs text-white/50">Share your match</span>
              </div>
              <MatchShareCard data={shareData} cardRef={cardRef} />
              <div className="flex gap-3 w-full px-1 pb-1">
                <Button
                  className="flex-1 gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20"
                  variant="outline"
                  onClick={handleDownloadCard}
                  disabled={sharing}
                >
                  <Download className="w-4 h-4" />
                  {sharing ? "Saving…" : "Download"}
                </Button>
                <Button
                  className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:opacity-90 text-white font-bold"
                  onClick={handleShareCard}
                  disabled={sharing}
                >
                  <Share2 className="w-4 h-4" />
                  {sharing ? "Sharing…" : "Share"}
                </Button>
              </div>
            </div>
          </>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" /> Submit Match Result
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prize Pool</span>
              <GoldCoin amount={prizePool.toFixed(0)} className="font-bold text-accent" />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Distributed</span>
              <GoldCoin amount={totalRewarded.toFixed(0)} className={cn("font-bold", isOverBudget ? "text-red-400" : "text-green-400")} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Remaining</span>
              <GoldCoin amount={remaining.toFixed(0)} className={cn("font-bold", remaining < 0 ? "text-red-400" : "text-foreground")} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-sm">
                <Camera className="w-3.5 h-3.5 text-primary" />
                Result Screenshots
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", screenshots.length > 0 ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground")}>
                {screenshots.length}/5
              </span>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <div className="text-xs text-amber-300 space-y-0.5">
                <p className="font-medium">Screenshots are optional</p>
                <p className="text-amber-400/80">Upload up to 5 in-game result screenshots for verification. These will be auto-deleted after 3 days.</p>
              </div>
            </div>

            {screenshotPreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {screenshotPreviews.map((src, i) => (
                  <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-border">
                    <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-destructive/90 rounded-full flex items-center justify-center text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/60 rounded text-[10px] text-white px-1">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {screenshots.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all",
                  uploading ? "border-border text-muted-foreground cursor-wait" :
                  screenshots.length === 0 ? "border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5" :
                  "border-border text-muted-foreground hover:border-border/80 hover:bg-secondary/40"
                )}
              >
                <ImagePlus className="w-4 h-4" />
                {uploading ? "Uploading..." : screenshots.length === 0 ? "Upload Screenshots (optional)" : "Add More Screenshots"}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {screenshots.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Screenshots will be auto-deleted after 3 days</span>
              </div>
            )}
          </div>


          {isOverBudget && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl p-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Total rewards exceed the prize pool of <GoldCoin amount={prizePool.toFixed(0)} size="sm" />
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : !participants || participants.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No participants have joined this match yet.
            </div>
          ) : (
            <div className="space-y-3">
              {participants.map((p) => (
                <div key={p.id} className="bg-secondary/50 border border-border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {p.teamNumber}
                    </div>
                    <span className="font-semibold text-sm">{p.teamName || `Team ${p.teamNumber}`}</span>
                  </div>

                  <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                    {p.players.map((pl, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="font-mono text-foreground">{pl.ign}</span>
                        <span className="opacity-50">·</span>
                        <span>{pl.uid}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Rank</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g. 1"
                        className="h-8 text-sm"
                        value={ranks[p.id] || ""}
                        onChange={(e) => setRanks((r) => ({ ...r, [p.id]: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Kills</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        className="h-8 text-sm"
                        value={kills[p.id] || ""}
                        onChange={(e) => setKills((k) => ({ ...k, [p.id]: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Reward (<GoldCoinIcon size="sm" />)</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        className="h-8 text-sm"
                        value={rewards[p.id] || ""}
                        onChange={(e) => setRewards((r) => ({ ...r, [p.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isPending || isLoading || !participants || participants.length === 0 || isOverBudget}
          >
            {isPending ? "Submitting..." : "Submit Result & Distribute Rewards"}
          </Button>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayerManagementDialog({ match, onAction }: { match: any; onAction: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: participants, isLoading, refetch } = useGetMatchPlayers(match.id, { query: { enabled: open } as any });

  const { mutateAsync: kickPlayer, isPending: isKicking } = useMutation({
    mutationFn: async (participantId: number) => {
      const res = await fetch(`/api/matches/${match.id}/participants/${participantId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to kick player");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      onAction();
    },
  });

  const handleKick = async (participantId: number, name: string) => {
    if (!confirm(`Kick "${name}" from this match? Their entry fee will be refunded.`)) return;
    try {
      await kickPlayer(participantId);
      toast({ title: "Player removed", description: "Entry fee has been refunded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1">
          <Users className="w-3.5 h-3.5" /> Players
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Players — {match.code}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : !participants || participants.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No players joined yet
            </div>
          ) : (
            participants.map((p: any) => {
              const displayName = p.teamName || p.players?.[0]?.ign || `Team ${p.teamNumber}`;
              const tierClass = trustTierColor(p.trustTier || "bronze");
              return (
                <div key={p.id} className="bg-secondary/50 rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold truncate">{displayName}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0", tierClass)}>
                        {trustTierIcon(p.trustTier || "bronze")} {p.trustScore ?? 500}
                      </span>
                    </div>
                    {p.players && p.players.length > 0 && (
                      <div className="text-xs text-muted-foreground truncate">
                        {p.players.map((pl: any) => pl.ign).join(", ")}
                      </div>
                    )}
                    {p.trustTier && (
                      <div className={cn("text-[10px] font-medium capitalize mt-0.5", tierClass.split(" ")[0])}>
                        {p.trustTier} tier
                      </div>
                    )}
                  </div>
                  {match.status !== "completed" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => handleKick(p.id, displayName)}
                      disabled={isKicking}
                      title="Kick player"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="text-xs text-muted-foreground text-center pt-2 shrink-0">
          {participants?.length ?? 0} / {match.slots} slots filled
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MatchCard({ match, onAction }: { match: any; onAction: () => void }) {
  const { toast } = useToast();
  const { mutateAsync: goLive, isPending: isGoingLive } = useGoLive();
  const { mutateAsync: updateRoom, isPending: isUpdatingRoom } = useUpdateRoomCredentials();
  const { mutateAsync: deleteMatch, isPending: isDeleting } = useDeleteMatch();
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomCreds, setRoomCreds] = useState({ roomId: match.roomId || "", roomPassword: match.roomPassword || "" });

  const handleGoLive = async () => {
    try {
      await goLive({ id: match.id });
      toast({ title: "Match is now LIVE!" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleUpdateRoom = async () => {
    if (!roomCreds.roomId || !roomCreds.roomPassword) {
      toast({ title: "Enter Room ID and Password", variant: "destructive" });
      return;
    }
    try {
      await updateRoom({ id: match.id, data: roomCreds });
      toast({ title: "Room credentials updated!" });
      setRoomOpen(false);
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete match ${match.code}? All entry fees will be refunded.`)) return;
    try {
      await deleteMatch({ id: match.id });
      toast({ title: "Match deleted and refunds processed" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const fillPercent = match.slots > 0 ? Math.round((match.filledSlots / match.slots) * 100) : 0;

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-sm">{match.game}</span>
              <span className="text-xs text-muted-foreground">• {match.mode}</span>
            </div>
            <span className="font-mono text-xs text-accent">{match.code}</span>
          </div>
          <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize font-medium", statusColor(match.status))}>
            {match.status === "live" ? "🔴 LIVE" : match.status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="bg-secondary/50 rounded-xl p-2">
            <div className="text-xs text-muted-foreground">Entry</div>
            <div className="font-bold text-sm"><GoldCoin amount={match.entryFee} size="sm" /></div>
          </div>
          <div className="bg-secondary/50 rounded-xl p-2">
            <div className="text-xs text-muted-foreground">Live Pool</div>
            <div className="font-bold text-sm text-accent"><GoldCoin amount={Math.round(match.livePrizePool || 0)} size="sm" /></div>
          </div>
          <div className="bg-secondary/50 rounded-xl p-2">
            <div className="text-xs text-muted-foreground">Slots</div>
            <div className="font-bold text-sm">{match.filledSlots}/{match.slots}</div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Fill rate</span>
            <span>{fillPercent}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", fillPercent >= 80 ? "bg-green-500" : fillPercent >= 50 ? "bg-primary" : "bg-accent")}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        {match.startTime && (
          <div className="text-xs text-muted-foreground mb-3">
            Starts: {new Date(match.startTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        )}

        {match.roomReleased && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 mb-3 text-xs">
            <div className="text-green-400 font-medium mb-1">Room Released</div>
            <div className="text-muted-foreground">ID: <span className="font-mono text-foreground">{match.roomId}</span></div>
            <div className="text-muted-foreground">Pass: <span className="font-mono text-foreground">{match.roomPassword}</span></div>
          </div>
        )}
      </div>

      <div className="border-t border-card-border px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <Link href={`/matches/${match.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1">
              <ChevronRight className="w-3.5 h-3.5" /> View
            </Button>
          </Link>
          <PlayerManagementDialog match={match} onAction={onAction} />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs gap-1 text-muted-foreground"
            title="Save as Template"
            onClick={() => {
              saveMatchAsTemplate(match);
              toast({ title: "Template saved!", description: "You can reuse these settings when creating a new match." });
            }}
          >
            <BookTemplate className="w-3.5 h-3.5" />
          </Button>
        </div>

        {match.status !== "completed" && (
          <div className="flex gap-2">
            <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1">
                  <Key className="w-3.5 h-3.5" /> Room
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Set Room Credentials</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Players will see these credentials once released.</p>
                  <div className="space-y-1.5">
                    <Label>Room ID</Label>
                    <Input
                      placeholder="Enter room ID"
                      value={roomCreds.roomId}
                      onChange={(e) => setRoomCreds(c => ({ ...c, roomId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Room Password</Label>
                    <Input
                      placeholder="Enter password"
                      value={roomCreds.roomPassword}
                      onChange={(e) => setRoomCreds(c => ({ ...c, roomPassword: e.target.value }))}
                    />
                  </div>
                  <Button className="w-full" onClick={handleUpdateRoom} disabled={isUpdatingRoom}>
                    {isUpdatingRoom ? "Saving..." : "Release Room"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {match.status === "upcoming" && (
              <Button size="sm" className="flex-1 h-8 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={handleGoLive} disabled={isGoingLive}>
                <Radio className="w-3.5 h-3.5" /> {isGoingLive ? "..." : "Go Live"}
              </Button>
            )}

            {match.status === "live" && (
              <SubmitResultDialog match={match} onAction={onAction} />
            )}

            <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HostDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | "upcoming" | "live">("all");
  const { data: allMatches, isLoading, refetch } = useListMatches({ status: statusFilter === "all" ? undefined : statusFilter });
  const { data: allMatchesForEarnings } = useListMatches({});

  const myMatches = (allMatches?.filter((m: any) => m.hostId === user?.id) ?? []).filter((m: any) => m.status !== "completed");

  const today = new Date().toISOString().slice(0, 10);
  const myAllMatches = (allMatchesForEarnings?.filter((m: any) => m.hostId === user?.id) ?? []);

  const todayEarnings = myAllMatches
    .filter((m: any) => m.status === "completed" && (m.startTime || m.createdAt || "").slice(0, 10) === today)
    .reduce((sum: number, m: any) => sum + parseFloat(String(m.hostCut || 0)), 0);

  const todayPlayersJoined = myAllMatches
    .filter((m: any) => (m.createdAt || "").slice(0, 10) === today || (m.startTime || "").slice(0, 10) === today)
    .reduce((sum: number, m: any) => sum + (m.filledSlots || 0), 0);

  const liveCount = myMatches.filter((m: any) => m.status === "live").length;

  const STATUS_OPTS = ["all", "upcoming", "live"] as const;

  return (
    <AppLayout title="Host Panel">
      <div className="space-y-4 pb-4">
        <div className="bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-primary/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wide">Today at a Glance</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-1.5">
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-blue-400">{todayPlayersJoined}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Players<br/>Today</div>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center mx-auto mb-1.5">
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-400"><GoldCoin amount={todayEarnings.toFixed(0)} /></div>
              <div className="text-[10px] text-muted-foreground leading-tight">Earned<br/>Today</div>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center mx-auto mb-1.5">
                <Zap className="w-4 h-4 text-green-400" />
              </div>
              <div className="text-2xl font-bold text-green-400">{liveCount}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Live<br/>Matches</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {myAllMatches.length > 0 && (
            <EarningsBreakdownDialog matches={myAllMatches} />
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 flex-1"
            onClick={() => navigate("/host/earnings")}
          >
            <History className="w-3.5 h-3.5" /> Earnings History
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_OPTS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 border transition-all capitalize",
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-5">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
          </div>
        ) : myMatches.length > 0 ? (
          <div className="space-y-5">
            {myMatches.map((m: any) => (
              <MatchCard key={m.id} match={m} onAction={refetch} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Swords className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No {statusFilter !== "all" ? statusFilter : ""} matches</p>
            <p className="text-sm mt-1">Create your first tournament to get started!</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
