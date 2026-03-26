import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GoldCoin } from "@/components/ui/Coins";
import {
  Gavel, Zap, Square, XCircle, Plus, Trash2, Upload, Trophy,
  CheckCircle, Users, ChevronDown, ChevronUp, Edit
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuctionPlayer = { id: number; name: string; avatar: string | null; position: number };
type AuctionTeam = {
  id: number; name: string; logo: string | null; displayOrder: number;
  players: AuctionPlayer[]; totalBidAmount: number; myBidAmount: number;
};
type AuctionDetail = {
  id: number; title: string; tournamentName: string;
  status: "upcoming" | "live" | "completed" | "cancelled";
  teams: AuctionTeam[]; totalPool: number;
  result: { firstTeamId: number; secondTeamId: number; thirdTeamId: number } | null;
  startTime: string | null; endTime: string | null;
};

async function convertToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 256;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/webp", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
    img.src = objectUrl;
  });
}

function AvatarImg({ src, name, size = "md" }: { src: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-14 h-14 text-lg" : "w-10 h-10 text-sm";
  if (src) {
    const url = src.startsWith("/objects/") ? `/api/storage/objects/${src.replace("/objects/", "")}` : src;
    return <img src={url} alt={name} className={cn("rounded-full object-cover bg-secondary", sizeClass)} />;
  }
  return (
    <div className={cn("rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary", sizeClass)}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ImageUploadButton({
  label, currentSrc, name, onUploaded, disabled
}: { label: string; currentSrc: string | null; name: string; onUploaded: (path: string) => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" }); return;
    }
    setIsUploading(true);
    try {
      const dataUrl = await convertToBase64(file);
      onUploaded(dataUrl);
    } catch {
      toast({ title: "Upload failed", description: "Try again", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <AvatarImg src={currentSrc} name={name} size="md" />
      <div>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={disabled || isUploading} />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={disabled || isUploading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/40 rounded-lg px-2.5 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3 h-3" />
          {isUploading ? "Uploading..." : label}
        </button>
        <p className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, WEBP · max 5MB</p>
      </div>
    </div>
  );
}

function TeamCard({
  team, auctionId, auctionStatus, onRefresh, result
}: {
  team: AuctionTeam; auctionId: number; auctionStatus: string;
  onRefresh: () => void;
  result: { firstTeamId: number; secondTeamId: number; thirdTeamId: number } | null;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [teamName, setTeamName] = useState(team.name);
  const [teamLogo, setTeamLogo] = useState(team.logo);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [playerForm, setPlayerForm] = useState({ name: "", avatar: null as string | null });
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  const editable = auctionStatus !== "completed" && auctionStatus !== "cancelled";

  const handleSaveTeam = async () => {
    setIsSavingTeam(true);
    try {
      await customFetch(`/api/auctions/${auctionId}/teams/${team.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: teamName, logo: teamLogo }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Team updated!" });
      setEditOpen(false);
      onRefresh();
    } catch {
      toast({ title: "Failed to update team", variant: "destructive" });
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!confirm(`Delete team "${team.name}"? This will also remove all its players.`)) return;
    try {
      await customFetch(`/api/auctions/${auctionId}/teams/${team.id}`, { method: "DELETE" });
      toast({ title: "Team deleted" });
      onRefresh();
    } catch {
      toast({ title: "Failed to delete team", variant: "destructive" });
    }
  };

  const handleAddPlayer = async () => {
    if (!playerForm.name.trim()) {
      toast({ title: "Player name required", variant: "destructive" }); return;
    }
    setIsAddingPlayer(true);
    try {
      await customFetch(`/api/auctions/${auctionId}/teams/${team.id}/players`, {
        method: "POST",
        body: JSON.stringify({ name: playerForm.name.trim(), avatar: playerForm.avatar, position: team.players.length + 1 }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Player added!" });
      setPlayerForm({ name: "", avatar: null });
      setAddPlayerOpen(false);
      onRefresh();
    } catch {
      toast({ title: "Failed to add player", variant: "destructive" });
    } finally {
      setIsAddingPlayer(false);
    }
  };

  const handleDeletePlayer = async (playerId: number) => {
    try {
      await customFetch(`/api/auctions/${auctionId}/teams/${team.id}/players/${playerId}`, { method: "DELETE" });
      toast({ title: "Player removed" });
      onRefresh();
    } catch {
      toast({ title: "Failed to remove player", variant: "destructive" });
    }
  };

  const placement =
    result?.firstTeamId === team.id ? 1 :
    result?.secondTeamId === team.id ? 2 :
    result?.thirdTeamId === team.id ? 3 : null;

  return (
    <div className={cn(
      "bg-card border rounded-2xl overflow-hidden",
      placement === 1 && "border-yellow-500/50",
      placement === 2 && "border-slate-400/50",
      placement === 3 && "border-orange-700/50",
      !placement && "border-card-border",
    )}>
      <div className="flex items-center gap-3 p-3">
        <AvatarImg src={team.logo} name={team.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate">{team.name}</span>
            {placement && (
              <span className="text-xs">{placement === 1 ? "🥇" : placement === 2 ? "🥈" : "🥉"}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{team.players.length} players</span>
            <GoldCoin amount={team.totalBidAmount.toFixed(0)} size="sm" />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editable && (
            <>
              <button
                onClick={() => setEditOpen(true)}
                className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDeleteTeam}
                className="w-7 h-7 rounded-lg hover:bg-destructive/20 flex items-center justify-center text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={() => setExpanded(e => !e)} className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2 space-y-2">
          {team.players.map(p => (
            <div key={p.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-2.5 py-2">
              <AvatarImg src={p.avatar} name={p.name} size="sm" />
              <span className="text-sm flex-1 truncate">{p.name}</span>
              {editable && (
                <button onClick={() => handleDeletePlayer(p.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {team.players.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-1">No players yet</p>
          )}
          {editable && (
            <button
              onClick={() => setAddPlayerOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-primary border border-dashed border-primary/40 rounded-lg py-2 hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Player
            </button>
          )}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Team</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Team Name</Label>
              <Input value={teamName} onChange={e => setTeamName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Team Logo</Label>
              <ImageUploadButton
                label="Upload Logo"
                currentSrc={teamLogo}
                name={teamName}
                onUploaded={setTeamLogo}
              />
            </div>
            <Button className="w-full" onClick={handleSaveTeam} disabled={isSavingTeam}>
              {isSavingTeam ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addPlayerOpen} onOpenChange={setAddPlayerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Player to {team.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Player Name</Label>
              <Input
                value={playerForm.name}
                onChange={e => setPlayerForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Player's name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Player Avatar</Label>
              <ImageUploadButton
                label="Upload Avatar"
                currentSrc={playerForm.avatar}
                name={playerForm.name || "P"}
                onUploaded={path => setPlayerForm(f => ({ ...f, avatar: path }))}
              />
            </div>
            <Button className="w-full" onClick={handleAddPlayer} disabled={isAddingPlayer}>
              {isAddingPlayer ? "Adding..." : "Add Player"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminAuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLogo, setNewTeamLogo] = useState<string | null>(null);
  const [resultForm, setResultForm] = useState({ firstTeamId: "", secondTeamId: "", thirdTeamId: "" });

  const load = useCallback(() => {
    customFetch<AuctionDetail>(`/api/auctions/${id}`)
      .then(setAuction)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleGoLive = async () => {
    if (!auction) return;
    setIsActionLoading(true);
    try {
      await customFetch(`/api/auctions/${auction.id}/go-live`, { method: "POST" });
      toast({ title: "Auction is now LIVE!", description: "Bidding is open." });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!auction) return;
    setIsActionLoading(true);
    try {
      await customFetch(`/api/auctions/${auction.id}/stop`, { method: "POST" });
      toast({ title: "Auction stopped.", description: "Bidding is closed." });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!auction || !confirm("Cancel this auction? All bids will be refunded.")) return;
    setIsActionLoading(true);
    try {
      await customFetch(`/api/auctions/${auction.id}/cancel`, { method: "POST" });
      toast({ title: "Auction cancelled", description: "All bids refunded." });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAddTeam = async () => {
    if (!auction || !newTeamName.trim()) {
      toast({ title: "Team name required", variant: "destructive" }); return;
    }
    try {
      await customFetch(`/api/auctions/${auction.id}/teams`, {
        method: "POST",
        body: JSON.stringify({ name: newTeamName.trim(), logo: newTeamLogo, displayOrder: auction.teams.length }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Team added!" });
      setNewTeamName("");
      setNewTeamLogo(null);
      setAddTeamOpen(false);
      load();
    } catch {
      toast({ title: "Failed to add team", variant: "destructive" });
    }
  };

  const handleSubmitResult = async () => {
    if (!auction) return;
    const { firstTeamId, secondTeamId, thirdTeamId } = resultForm;
    if (!firstTeamId || !secondTeamId || !thirdTeamId) {
      toast({ title: "Select all 3 placements", variant: "destructive" }); return;
    }
    if (new Set([firstTeamId, secondTeamId, thirdTeamId]).size !== 3) {
      toast({ title: "Each placement must be a different team", variant: "destructive" }); return;
    }
    setIsActionLoading(true);
    try {
      await customFetch(`/api/auctions/${auction.id}/submit-result`, {
        method: "POST",
        body: JSON.stringify({
          firstTeamId: Number(firstTeamId),
          secondTeamId: Number(secondTeamId),
          thirdTeamId: Number(thirdTeamId),
        }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Result submitted!", description: "Rewards distributed to bidders." });
      setResultOpen(false);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout showBack title="Manage Auction">
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-2xl" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </AppLayout>
    );
  }

  if (!auction) {
    return (
      <AppLayout showBack title="Manage Auction">
        <p className="text-center text-muted-foreground pt-10">Auction not found.</p>
      </AppLayout>
    );
  }

  const isEditable = auction.status !== "completed" && auction.status !== "cancelled";

  return (
    <AppLayout showBack title={auction.title}>
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <div>
            <h2 className="font-bold text-lg">{auction.title}</h2>
            <p className="text-muted-foreground text-sm">{auction.tournamentName}</p>
          </div>
          <div className="flex gap-3 flex-wrap text-sm">
            <div><span className="text-muted-foreground">Status: </span>
              <span className={cn("font-semibold capitalize",
                auction.status === "live" && "text-green-400",
                auction.status === "upcoming" && "text-yellow-400",
                auction.status === "completed" && "text-blue-400",
                auction.status === "cancelled" && "text-destructive",
              )}>{auction.status}</span>
            </div>
            <div><span className="text-muted-foreground">Teams: </span><span className="font-semibold">{auction.teams.length}</span></div>
            <div><span className="text-muted-foreground">Pool: </span><GoldCoin amount={auction.totalPool.toFixed(0)} size="sm" className="inline-flex" /></div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {auction.status === "upcoming" && (
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={handleGoLive} disabled={isActionLoading}>
                <Zap className="w-3.5 h-3.5" /> Go Live
              </Button>
            )}
            {auction.status === "live" && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleStop} disabled={isActionLoading}>
                  <Square className="w-3.5 h-3.5" /> Stop Bidding
                </Button>
                <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setResultOpen(true)}>
                  <Trophy className="w-3.5 h-3.5" /> Submit Result
                </Button>
              </>
            )}
            {auction.status === "upcoming" && (
              <Button size="sm" variant="outline" className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={handleCancel} disabled={isActionLoading}>
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            )}
            {auction.status === "completed" && (
              <div className="flex items-center gap-1.5 text-blue-400 text-sm font-medium">
                <CheckCircle className="w-4 h-4" /> Completed — rewards distributed
              </div>
            )}
          </div>
        </div>

        {auction.result && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> Result</h3>
            {[
              { label: "🥇 1st Place", teamId: auction.result.firstTeamId, share: "50%" },
              { label: "🥈 2nd Place", teamId: auction.result.secondTeamId, share: "30%" },
              { label: "🥉 3rd Place", teamId: auction.result.thirdTeamId, share: "20%" },
            ].map(({ label, teamId, share }) => {
              const t = auction.teams.find(t => t.id === teamId);
              return (
                <div key={label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm">{label} — <span className="font-semibold">{t?.name || `Team #${teamId}`}</span></span>
                  <span className="text-xs text-muted-foreground">{share} of pool</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Teams ({auction.teams.length})
          </h3>
          {isEditable && (
            <button
              onClick={() => setAddTeamOpen(true)}
              className="flex items-center gap-1 text-xs text-primary font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Team
            </button>
          )}
        </div>

        {auction.teams.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-2xl">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No teams yet</p>
            <p className="text-xs mt-1">Add teams to this auction</p>
          </div>
        )}

        <div className="space-y-3">
          {auction.teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              auctionId={auction.id}
              auctionStatus={auction.status}
              result={auction.result}
              onRefresh={load}
            />
          ))}
        </div>
      </div>

      <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Team</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Team Name</Label>
              <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. Team Alpha" />
            </div>
            <div className="space-y-1.5">
              <Label>Team Logo</Label>
              <ImageUploadButton
                label="Upload Logo"
                currentSrc={newTeamLogo}
                name={newTeamName || "T"}
                onUploaded={setNewTeamLogo}
              />
            </div>
            <Button className="w-full" onClick={handleAddTeam}>Add Team</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-500" /> Submit Result</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Rewards: 1st → 50%, 2nd → 30%, 3rd → 20% of the remaining pool (after 12% platform fee).
            </p>
            {([
              { label: "🥇 1st Place", key: "firstTeamId" as const },
              { label: "🥈 2nd Place", key: "secondTeamId" as const },
              { label: "🥉 3rd Place", key: "thirdTeamId" as const },
            ]).map(({ label, key }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <select
                  value={resultForm[key]}
                  onChange={e => setResultForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select team —</option>
                  {auction.teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="bg-secondary/50 rounded-lg px-3 py-2 text-xs text-muted-foreground">
              Total Pool: <span className="font-semibold text-foreground">{auction.totalPool.toFixed(0)} GC</span> ·
              Platform (12%): <span className="font-semibold text-foreground">{(auction.totalPool * 0.12).toFixed(0)} GC</span>
            </div>
            <Button className="w-full" onClick={handleSubmitResult} disabled={isActionLoading}>
              {isActionLoading ? "Submitting..." : "Submit & Distribute Rewards"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
