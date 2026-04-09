import { useState, useRef } from "react";
import { Link } from "wouter";
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
import { cn } from "@/lib/utils";
import { Swords, Trophy, Zap, Radio, Key, Trash2, ChevronRight, Medal, AlertCircle, BarChart3, Download, ImagePlus, X, Camera, Clock, Bot, Sparkles, ShieldAlert, CheckCircle2, RefreshCw } from "lucide-react";

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

function SubmitResultDialog({ match, onAction }: { match: any; onAction: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data: participants, isLoading } = useGetMatchPlayers(match.id, { query: { enabled: open } as any });
  const { mutateAsync: submitResult, isPending } = useSubmitResult();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ranks, setRanks] = useState<Record<number, string>>({});
  const [rewards, setRewards] = useState<Record<number, string>>({});
  const [kills, setKills] = useState<Record<number, string>>({});
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [screenshotFiles, setScreenshotFiles] = useState<{ base64: string; mimeType: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  const prizePool = parseFloat(String(match.livePrizePool || 0));
  const totalRewarded = (participants || []).reduce((sum, p) => {
    const val = parseFloat(rewards[p.id] || "0");
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const remaining = prizePool - totalRewarded;
  const isOverBudget = totalRewarded > prizePool + 0.01;

  const readFileAsBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve({ base64, mimeType: file.type || "image/jpeg" });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const canAdd = Math.min(files.length, 5 - screenshots.length);
    if (canAdd <= 0) {
      toast({ title: "Maximum 5 screenshots allowed", variant: "destructive" });
      return;
    }
    setUploading(true);
    setAiResult(null);
    try {
      const newPaths: string[] = [];
      const newPreviews: string[] = [];
      const newFiles: { base64: string; mimeType: string }[] = [];
      for (let i = 0; i < canAdd; i++) {
        const file = files[i];
        const preview = URL.createObjectURL(file);
        newPreviews.push(preview);
        const fileData = await readFileAsBase64(file);
        newFiles.push(fileData);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/storage/uploads/file", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        newPaths.push(data.objectPath || "uploaded");
      }
      setScreenshots(prev => [...prev, ...newPaths]);
      setScreenshotPreviews(prev => [...prev, ...newPreviews]);
      setScreenshotFiles(prev => [...prev, ...newFiles]);
      toast({ title: `${canAdd} screenshot${canAdd > 1 ? "s" : ""} uploaded!` });
    } catch {
      toast({ title: "Screenshot upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const analyzeWithAI = async () => {
    if (screenshotFiles.length === 0) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const { base64, mimeType } = screenshotFiles[0];
      const participantNames = (participants || []).map((p: any) =>
        p.players?.map((pl: any) => pl.ign).join(", ") || p.teamName || `Team ${p.teamNumber}`
      );
      const res = await fetch("/api/ai/analyze-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          participants: participantNames,
          game: match.game,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAiResult(data);
    } catch (err: any) {
      toast({ title: "AI Analysis Failed", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const applyAIResults = () => {
    if (!aiResult?.players || !participants) return;
    const newRanks: Record<number, string> = { ...ranks };
    const newKills: Record<number, string> = { ...kills };
    participants.forEach((p: any) => {
      const pNames = p.players?.map((pl: any) => pl.ign.toLowerCase()) || [];
      const teamName = (p.teamName || `Team ${p.teamNumber}`).toLowerCase();
      const matched = aiResult.players.find((ap: any) => {
        const apName = ap.name?.toLowerCase() || "";
        return pNames.some((n: string) => apName.includes(n) || n.includes(apName)) || apName.includes(teamName) || teamName.includes(apName);
      });
      if (matched) {
        if (matched.rank) newRanks[p.id] = String(matched.rank);
        if (matched.kills != null) newKills[p.id] = String(matched.kills);
      }
    });
    setRanks(newRanks);
    setKills(newKills);
    toast({ title: "AI results applied!", description: "Rank and kills have been auto-filled. Please verify and set rewards." });
  };

  const removeScreenshot = (idx: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== idx));
    setScreenshotPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!participants || participants.length === 0) return;
    if (screenshots.length === 0) {
      toast({ title: "Upload at least 1 in-game result screenshot", description: "Screenshots are mandatory to verify results.", variant: "destructive" });
      return;
    }
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
      setOpen(false);
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
      setScreenshotFiles([]);
      setAiResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1 h-8 text-xs gap-1 bg-accent hover:bg-accent/90 text-accent-foreground">
          <Medal className="w-3.5 h-3.5" /> Result
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
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
                <span className="text-destructive">*</span>
              </Label>
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", screenshots.length > 0 ? "bg-green-500/20 text-green-400" : "bg-destructive/20 text-destructive")}>
                {screenshots.length}/5
              </span>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <div className="text-xs text-amber-300 space-y-0.5">
                <p className="font-medium">Screenshots are mandatory</p>
                <p className="text-amber-400/80">Upload 1–5 in-game result screenshots. These will be auto-deleted after 3 days.</p>
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
                  screenshots.length === 0 ? "border-primary/50 text-primary hover:border-primary hover:bg-primary/5" :
                  "border-border text-muted-foreground hover:border-border/80 hover:bg-secondary/40"
                )}
              >
                <ImagePlus className="w-4 h-4" />
                {uploading ? "Uploading..." : screenshots.length === 0 ? "Upload Screenshots (required)" : "Add More Screenshots"}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
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

          {screenshots.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={analyzeWithAI}
                disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300 text-sm font-semibold hover:bg-violet-600/30 transition-all disabled:opacity-60"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    AI is analyzing screenshot...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    <Sparkles className="w-3.5 h-3.5" />
                    Verify with AI Referee
                  </>
                )}
              </button>

              {aiResult && (
                <div className={cn(
                  "rounded-xl border p-3 space-y-2.5 text-xs",
                  aiResult.suspicious
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-green-500/10 border-green-500/30"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-sm">
                      {aiResult.suspicious ? (
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      <span className={aiResult.suspicious ? "text-red-400" : "text-green-400"}>
                        {aiResult.suspicious ? "Suspicious Screenshot Detected" : "Screenshot Verified"}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {aiResult.game} · {aiResult.confidence}% confident
                    </span>
                  </div>

                  {aiResult.suspicious && aiResult.suspiciousReason && (
                    <div className="bg-red-500/15 border border-red-500/25 rounded-lg px-2.5 py-2 text-red-300">
                      ⚠️ {aiResult.suspiciousReason}
                    </div>
                  )}

                  {aiResult.players?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground font-medium">AI Detected Results:</p>
                      <div className="bg-black/20 rounded-lg p-2 space-y-1">
                        {aiResult.players.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="font-mono text-foreground truncate max-w-[120px]">{p.name}</span>
                            <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                              <span>#{p.rank ?? "?"}</span>
                              <span>{p.kills ?? "?"} kills</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiResult.notes && (
                    <p className="text-muted-foreground italic">{aiResult.notes}</p>
                  )}

                  {aiResult.players?.length > 0 && (
                    <button
                      type="button"
                      onClick={applyAIResults}
                      className="w-full py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-semibold hover:bg-violet-600/40 transition-all"
                    >
                      Auto-fill Rank &amp; Kills from AI
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

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
            disabled={isPending || isLoading || !participants || participants.length === 0 || isOverBudget || screenshots.length === 0}
          >
            {isPending ? "Submitting..." : screenshots.length === 0 ? "Upload Screenshots First" : "Submit Result & Distribute Rewards"}
          </Button>
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

      <div className="border-t border-card-border px-4 py-3 flex gap-2">
        <Link href={`/matches/${match.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1">
            <ChevronRight className="w-3.5 h-3.5" /> View
          </Button>
        </Link>

        {match.status !== "completed" && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export default function HostDashboardPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "upcoming" | "live">("all");
  const { data: allMatches, isLoading, refetch } = useListMatches({ status: statusFilter === "all" ? undefined : statusFilter });
  const { data: allMatchesForEarnings } = useListMatches({});

  const myMatches = (allMatches?.filter((m: any) => m.hostId === user?.id) ?? []).filter((m: any) => m.status !== "completed");

  const totalEarnings = (allMatchesForEarnings?.filter((m: any) => m.hostId === user?.id) ?? [])
    .filter((m: any) => m.status === "completed")
    .reduce((sum: number, m: any) => sum + (parseFloat(String(m.hostCut || 0))), 0);

  const liveCount = myMatches.filter((m: any) => m.status === "live").length;

  const STATUS_OPTS = ["all", "upcoming", "live"] as const;

  return (
    <AppLayout title="Host Panel">
      <div className="space-y-4 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-card-border rounded-xl p-3 text-center">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center mx-auto mb-1.5">
              <Swords className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold">{myMatches.length}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3 text-center">
            <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center mx-auto mb-1.5">
              <Zap className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="text-xl font-bold text-green-400">{liveCount}</div>
            <div className="text-[10px] text-muted-foreground">Live Now</div>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3 text-center relative">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center mx-auto mb-1.5">
              <Trophy className="w-3.5 h-3.5 text-accent" />
            </div>
            <div className="text-xl font-bold"><GoldCoin amount={totalEarnings.toFixed(0)} /></div>
            <div className="text-[10px] text-muted-foreground">Earned</div>
          </div>
        </div>

        {(allMatchesForEarnings?.filter((m: any) => m.hostId === user?.id) ?? []).length > 0 && (
          <div className="flex justify-end">
            <EarningsBreakdownDialog matches={allMatchesForEarnings?.filter((m: any) => m.hostId === user?.id) ?? []} />
          </div>
        )}

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
