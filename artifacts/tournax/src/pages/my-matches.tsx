import { useState } from "react";
import { useGetMyMatches, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, History, Trophy, DollarSign, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { GoldCoin } from "@/components/ui/Coins";
import { Link } from "wouter";

const GAMES = ["all", "BGMI", "Free Fire", "COD Mobile", "Valorant", "PUBG PC"];

interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  handle: string;
  avatar: string;
  game: string | null;
  totalMatches: number;
  wins: number;
  totalEarnings: number;
}

const rankColors = ["text-yellow-400", "text-slate-400", "text-amber-600"];
const rankBgs = ["bg-yellow-400/10 border-yellow-400/30", "bg-slate-400/10 border-slate-400/30", "bg-amber-600/10 border-amber-600/30"];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-400 shrink-0" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600 shrink-0" />;
  return <span className="w-4 text-center text-xs font-bold text-muted-foreground shrink-0">#{rank}</span>;
}

function LeaderboardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [game, setGame] = useState("all");
  const [type, setType] = useState("wins");

  const { data, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", game, type],
    queryFn: () => customFetch(`/api/leaderboard?game=${encodeURIComponent(game)}&type=${type}`),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" /> Leaderboard
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2 shrink-0 flex gap-2">
          <Select value={game} onValueChange={setGame}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAMES.map(g => (
                <SelectItem key={g} value={g}>{g === "all" ? "All Games" : g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wins">By Wins</SelectItem>
              <SelectItem value="earnings">By Earnings</SelectItem>
              <SelectItem value="matches">By Matches</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1.5">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : data?.length ? (
            data.map(entry => {
              const isTop3 = entry.rank <= 3;
              const inner = (
                <div className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all",
                  isTop3 ? rankBgs[entry.rank - 1] : "bg-card border-card-border hover:border-primary/30"
                )}>
                  <RankBadge rank={entry.rank} />
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-base shrink-0">
                    {entry.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn("font-semibold text-sm truncate", isTop3 && rankColors[entry.rank - 1])}>
                      {entry.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      @{entry.handle}{entry.game ? ` · ${entry.game}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {type === "wins" && <><div className={cn("font-bold text-sm", isTop3 ? rankColors[entry.rank - 1] : "")}>{entry.wins}</div><div className="text-[10px] text-muted-foreground">wins</div></>}
                    {type === "earnings" && <><div className="font-bold text-sm text-green-400"><GoldCoin amount={entry.totalEarnings.toFixed(0)} /></div><div className="text-[10px] text-muted-foreground">earned</div></>}
                    {type === "matches" && <><div className={cn("font-bold text-sm", isTop3 ? rankColors[entry.rank - 1] : "")}>{entry.totalMatches}</div><div className="text-[10px] text-muted-foreground">played</div></>}
                  </div>
                </div>
              );
              if (!entry.handle) return <div key={entry.id}>{inner}</div>;
              return <Link key={entry.id} href={`/profile/${entry.handle}`} onClick={onClose}>{inner}</Link>;
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No data yet. Play some matches!
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
        >
          <Star
            className={cn(
              "w-8 h-8 transition-colors",
              (hovered || value) >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewDialog({ match, onDone }: { match: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!rating) {
      toast({ title: "Please select a star rating", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      await customFetch(`/api/matches/${match.id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      });
      toast({ title: "Review submitted!", description: "Thanks for rating this host." });
      setOpen(false);
      setSubmitted(true);
      onDone();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to submit review", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if ((match as any).hasReviewed || submitted) {
    return (
      <div className="flex items-center gap-1 mt-2">
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
        ))}
        <span className="text-xs text-muted-foreground ml-1">You reviewed this host</span>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="mt-2 w-full gap-1.5 text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/10"
        onClick={() => setOpen(true)}
      >
        <Star className="w-3.5 h-3.5" /> Rate Host @{match.hostHandle}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rate Host @{match.hostHandle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">How was your experience in <span className="text-foreground font-medium">{match.game} — {match.mode}</span>?</p>
            <div className="flex justify-center py-2">
              <StarRating value={rating} onChange={setRating} />
            </div>
            <Textarea
              placeholder="Leave a comment (optional)..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <Button className="w-full" onClick={handleSubmit} disabled={submitting || !rating}>
              {submitting ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HistoryDialog({ open, onClose, history, isPlayer, onReviewDone }: {
  open: boolean;
  onClose: () => void;
  history: any[];
  isPlayer: boolean;
  onReviewDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-400" /> Match History
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {history.length > 0 ? (
            <div className="flex flex-col gap-2">
              {history.map((m) => (
                <div key={m.id}>
                  <MatchCard match={m} />
                  {isPlayer && (
                    <ReviewDialog match={m} onDone={onReviewDone} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📜</div>
              <h3 className="font-semibold">No match history</h3>
              <p className="text-muted-foreground text-sm mt-1">Completed matches will appear here</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MyMatchesPage() {
  const { data, isLoading, refetch } = useGetMyMatches();
  const { user } = useAuth();
  const isHost = user?.role === "host" || user?.role === "admin";
  const isPlayer = user?.role === "player";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  return (
    <AppLayout title="My Matches" showBack={false}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{isHost ? "My Matches" : "Active Matches"}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeaderboardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/20 transition-colors"
            >
              <Trophy className="w-3.5 h-3.5" />
              Ranks
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-5">
            {[1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : data?.participated.length ? (
          <div className="flex flex-col gap-2">
            {data.participated.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="font-semibold">No active matches</h3>
            <p className="text-muted-foreground text-sm mt-1">Join a tournament to get started</p>
          </div>
        )}
      </div>

      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={data?.history ?? []}
        isPlayer={isPlayer}
        onReviewDone={refetch}
      />

      <LeaderboardDialog
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
      />
    </AppLayout>
  );
}
