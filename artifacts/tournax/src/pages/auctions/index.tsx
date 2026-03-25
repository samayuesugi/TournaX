import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { GoldCoin } from "@/components/ui/Coins";
import { Gavel, Trophy, Clock, Zap, CheckCircle, History, ChevronRight, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

type Auction = {
  id: number;
  title: string;
  tournamentName: string;
  status: "upcoming" | "live" | "completed" | "cancelled";
  teamsCount: number;
  totalPool: number;
  startTime: string | null;
  endTime: string | null;
};

type HistoryAuction = Auction & {
  myTotalBid: number;
  result: { winnerTeamId: number; prizePool: number } | null;
};

const statusConfig = {
  upcoming: { label: "Upcoming", icon: Clock, class: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  live: { label: "LIVE", icon: Zap, class: "bg-green-500/20 text-green-400 border-green-500/30 animate-pulse" },
  completed: { label: "Completed", icon: CheckCircle, class: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cancelled: { label: "Cancelled", icon: CheckCircle, class: "bg-destructive/20 text-destructive border-destructive/30" },
};

export default function AuctionsPage() {
  const [, navigate] = useLocation();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [history, setHistory] = useState<HistoryAuction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  useEffect(() => {
    customFetch<Auction[]>("/api/auctions")
      .then(data => setAuctions(data.filter(a => a.status !== "cancelled" && a.status !== "completed")))
      .catch(() => {})
      .finally(() => setIsLoading(false));

    customFetch<HistoryAuction[]>("/api/auctions/my-history")
      .then(setHistory)
      .catch(() => {})
      .finally(() => setIsHistoryLoading(false));
  }, []);

  return (
    <AppLayout title="Team Auctions">
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <Gavel className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Team Auctions</h1>
            <p className="text-muted-foreground text-xs">Bid on teams, win big rewards</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground bg-card border border-card-border rounded-2xl">
            <Gavel className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No active auctions</p>
            <p className="text-xs mt-0.5">Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {auctions.map(auction => {
              const cfg = statusConfig[auction.status];
              const StatusIcon = cfg.icon;
              return (
                <button
                  key={auction.id}
                  className="w-full text-left bg-card border border-card-border rounded-2xl p-4 hover:border-primary/40 transition-all active:scale-[0.98]"
                  onClick={() => navigate(`/auctions/${auction.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5", cfg.class)}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <h3 className="font-bold text-base truncate">{auction.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{auction.tournamentName}</p>
                    </div>
                    <Trophy className="w-8 h-8 text-yellow-500/60 shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Teams</p>
                      <p className="text-sm font-bold">{auction.teamsCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Pool</p>
                      <GoldCoin amount={auction.totalPool.toFixed(0)} size="sm" />
                    </div>
                    {auction.startTime && (
                      <div className="ml-auto text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(auction.startTime).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <History className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-bold text-sm">Auction History</h2>
          </div>

          {isHistoryLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-card border border-card-border rounded-2xl">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No auction history yet</p>
              <p className="text-xs opacity-60 mt-0.5">Participate in auctions to see them here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(auction => (
                <button
                  key={auction.id}
                  className="w-full text-left bg-card border border-card-border rounded-2xl p-4 hover:border-primary/40 transition-all active:scale-[0.98]"
                  onClick={() => navigate(`/auctions/${auction.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Medal className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm truncate">{auction.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{auction.tournamentName}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">My Bids</p>
                      <GoldCoin amount={auction.myTotalBid.toFixed(0)} size="sm" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Pool</p>
                      <GoldCoin amount={auction.totalPool.toFixed(0)} size="sm" />
                    </div>
                    <div className="ml-auto">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Completed
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
