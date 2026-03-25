import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";
import { Trophy, Users, Zap, Clock, CheckCircle, XCircle, Gavel, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/useAuth";

type AuctionPlayer = { id: number; name: string; avatar: string | null; position: number };
type AuctionTeam = {
  id: number; name: string; logo: string | null; displayOrder: number;
  players: AuctionPlayer[]; totalBidAmount: number; myBidAmount: number;
};
type AuctionResult = {
  firstTeamId: number; secondTeamId: number; thirdTeamId: number;
  totalPool: string; platformFee: string;
};
type AuctionDetail = {
  id: number; title: string; tournamentName: string;
  status: "upcoming" | "live" | "completed" | "cancelled";
  teams: AuctionTeam[]; totalPool: number; result: AuctionResult | null;
  startTime: string | null; endTime: string | null;
};

const statusConfig = {
  upcoming: { label: "Upcoming", icon: Clock, class: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  live: { label: "LIVE — Bidding Open", icon: Zap, class: "bg-green-500/20 text-green-400 border-green-500/30" },
  completed: { label: "Completed", icon: CheckCircle, class: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cancelled: { label: "Cancelled", icon: XCircle, class: "bg-destructive/20 text-destructive border-destructive/30" },
};

function AvatarImg({ src, name, size = "md" }: { src: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
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

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<AuctionTeam | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [isBidding, setIsBidding] = useState(false);

  const load = useCallback(() => {
    customFetch<AuctionDetail>(`/api/auctions/${id}`)
      .then(setAuction)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleBid = async () => {
    if (!selectedTeam || !auction) return;
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount < 1) {
      toast({ title: "Minimum bid is 1 GC", variant: "destructive" }); return;
    }
    setIsBidding(true);
    try {
      await customFetch(`/api/auctions/${auction.id}/bid`, {
        method: "POST",
        body: JSON.stringify({ teamId: selectedTeam.id, amount }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Bid placed!", description: `${amount} GC on ${selectedTeam.name}` });
      setBidAmount("");
      setSelectedTeam(null);
      await refreshUser();
      load();
    } catch (err: any) {
      toast({ title: "Bid failed", description: err?.data?.error || "Try again", variant: "destructive" });
    } finally {
      setIsBidding(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout showBack title="Auction">
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      </AppLayout>
    );
  }

  if (!auction) {
    return (
      <AppLayout showBack title="Auction">
        <p className="text-muted-foreground text-center pt-10">Auction not found.</p>
      </AppLayout>
    );
  }

  const cfg = statusConfig[auction.status];
  const StatusIcon = cfg.icon;
  const isLive = auction.status === "live";

  const getTeamPlacement = (teamId: number) => {
    if (!auction.result) return null;
    if (auction.result.firstTeamId === teamId) return 1;
    if (auction.result.secondTeamId === teamId) return 2;
    if (auction.result.thirdTeamId === teamId) return 3;
    return null;
  };

  const placementLabel: Record<number, string> = { 1: "🥇 1st", 2: "🥈 2nd", 3: "🥉 3rd" };

  return (
    <AppLayout showBack title={auction.title}>
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-lg leading-tight">{auction.title}</h2>
              <p className="text-muted-foreground text-sm">{auction.tournamentName}</p>
            </div>
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2.5 py-1 shrink-0", cfg.class)}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-5 mt-3 pt-3 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Pool</p>
              <GoldCoin amount={auction.totalPool.toFixed(0)} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Teams</p>
              <p className="font-bold">{auction.teams.length}</p>
            </div>
            {auction.result && (
              <div className="ml-auto">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Platform Fee</p>
                <p className="font-bold text-sm">{(parseFloat(auction.result.platformFee as string)).toFixed(0)} GC</p>
              </div>
            )}
          </div>
        </div>

        {isLive && user?.role === "player" && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-green-400 text-sm font-medium">Bidding is open! Tap any team to place your bid.</p>
          </div>
        )}

        {auction.status === "upcoming" && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-yellow-400 text-sm font-medium">Auction hasn't started yet. Stay tuned!</p>
          </div>
        )}

        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Teams</h3>
          <div className="space-y-3">
            {auction.teams.map(team => {
              const placement = getTeamPlacement(team.id);
              return (
                <button
                  key={team.id}
                  className={cn(
                    "w-full bg-card border rounded-2xl p-4 text-left transition-all active:scale-[0.98]",
                    isLive && user?.role === "player" ? "border-primary/40 hover:border-primary cursor-pointer" : "border-card-border cursor-default",
                    placement === 1 && "border-yellow-500/60 bg-yellow-500/5",
                    placement === 2 && "border-slate-400/60 bg-slate-400/5",
                    placement === 3 && "border-orange-700/60 bg-orange-700/5",
                  )}
                  onClick={() => {
                    if (isLive && user?.role === "player") setSelectedTeam(team);
                  }}
                >
                  {/* Team header */}
                  <div className="flex items-center gap-3 mb-3">
                    <AvatarImg src={team.logo} name={team.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base leading-tight">{team.name}</p>
                      {placement && (
                        <span className="text-sm font-semibold">{placementLabel[placement]}</span>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{team.players.length} player{team.players.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Bids</p>
                      <GoldCoin amount={team.totalBidAmount.toFixed(0)} size="sm" />
                      {team.myBidAmount > 0 && (
                        <div className="mt-1">
                          <p className="text-[10px] text-primary uppercase tracking-wide">My Bid</p>
                          <GoldCoin amount={team.myBidAmount.toFixed(0)} size="sm" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Players list */}
                  {team.players.length > 0 && (
                    <div className="border-t border-border/40 pt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Players</p>
                      <div className="grid grid-cols-2 gap-2">
                        {team.players.map(p => (
                          <div key={p.id} className="flex items-center gap-2 bg-secondary/40 rounded-lg px-2.5 py-1.5">
                            <AvatarImg src={p.avatar} name={p.name} size="sm" />
                            <span className="text-xs font-medium truncate">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isLive && user?.role === "player" && (
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                      <span className="text-xs text-primary font-medium">Tap to bid on this team</span>
                      <ChevronRight className="w-4 h-4 text-primary" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={!!selectedTeam} onOpenChange={(o) => !o && setSelectedTeam(null)}>
        <DialogContent className="max-w-sm">
          {selectedTeam && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <AvatarImg src={selectedTeam.logo} name={selectedTeam.name} size="md" />
                  {selectedTeam.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Players</p>
                  <div className="space-y-2">
                    {selectedTeam.players.map(p => (
                      <div key={p.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                        <AvatarImg src={p.avatar} name={p.name} size="sm" />
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                    ))}
                    {selectedTeam.players.length === 0 && (
                      <p className="text-xs text-muted-foreground">No players added yet.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2">
                  <Gavel className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total bids on this team</p>
                    <GoldCoin amount={selectedTeam.totalBidAmount.toFixed(0)} />
                  </div>
                </div>

                {isLive && user?.role === "player" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Place Your Bid</p>
                    <div className="relative">
                      <GoldCoinIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Enter amount (min 1 GC)"
                        value={bidAmount}
                        onChange={e => setBidAmount(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Button className="w-full gap-2" onClick={handleBid} disabled={isBidding}>
                      <Gavel className="w-4 h-4" />
                      {isBidding ? "Placing bid..." : "Place Bid"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Your reward = (your bid / team total) × team prize share
                    </p>
                  </div>
                )}

                {!isLive && (
                  <p className="text-xs text-muted-foreground text-center">
                    {auction.status === "live" ? "" : "Bidding is currently closed."}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
