import { useState } from "react";
import { Link } from "wouter";
import {
  useListMatches, useGoLive, useUpdateRoomCredentials, useDeleteMatch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Swords, Trophy, Users, Zap, Plus, Radio, Key, Trash2, ChevronRight } from "lucide-react";

function statusColor(status: string) {
  if (status === "live") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "upcoming") return "bg-primary/20 text-primary border-primary/30";
  if (status === "completed") return "bg-muted text-muted-foreground border-border";
  return "bg-secondary text-muted-foreground border-border";
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
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
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
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete match ${match.code}? All entry fees will be refunded.`)) return;
    try {
      await deleteMatch({ id: match.id });
      toast({ title: "Match deleted and refunds processed" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
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
            <div className="font-bold text-sm">₹{match.entryFee}</div>
          </div>
          <div className="bg-secondary/50 rounded-xl p-2">
            <div className="text-xs text-muted-foreground">Prize Pool</div>
            <div className="font-bold text-sm text-accent">₹{match.prizePool}</div>
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

      {match.status !== "completed" && (
        <div className="border-t border-card-border px-4 py-3 flex gap-2">
          <Link href={`/matches/${match.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1">
              <ChevronRight className="w-3.5 h-3.5" /> View
            </Button>
          </Link>

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

          <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function HostDashboardPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "upcoming" | "live" | "completed">("all");
  const { data: allMatches, isLoading, refetch } = useListMatches({ status: statusFilter });

  const myMatches = allMatches?.filter((m: any) => m.hostId === user?.id) ?? [];

  const totalEarnings = myMatches
    .filter((m: any) => m.status === "completed")
    .reduce((sum: number, m: any) => sum + m.prizePool * 0.2, 0);

  const liveCount = myMatches.filter((m: any) => m.status === "live").length;
  const upcomingCount = myMatches.filter((m: any) => m.status === "upcoming").length;

  const STATUS_OPTS = ["all", "upcoming", "live", "completed"] as const;

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
          <div className="bg-card border border-card-border rounded-xl p-3 text-center">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center mx-auto mb-1.5">
              <Trophy className="w-3.5 h-3.5 text-accent" />
            </div>
            <div className="text-xl font-bold">₹{totalEarnings.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground">Earned</div>
          </div>
        </div>

        <Link href="/host/create-match">
          <Button className="w-full gap-2" size="lg">
            <Plus className="w-4 h-4" /> Create New Tournament
          </Button>
        </Link>

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
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
          </div>
        ) : myMatches.length > 0 ? (
          <div className="space-y-3">
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
