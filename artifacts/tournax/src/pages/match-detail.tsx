import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Users, Gift, Clock, Shield, Copy, Check, Trash2 } from "lucide-react";
import {
  useGetMatch, useJoinMatch, useGetMatchPlayers, useUpdateRoomCredentials,
  useGoLive, useDeleteMatch, useGetMySquad
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

interface LivePrizePoolProps {
  match: {
    filledSlots: number;
    slots: number;
    entryFee: number;
    showcasePrizePool: number;
    livePrizePool: number;
    hostCut: number;
    platformCut: number;
    totalPool: number;
    winnersPercent: number;
    hostPercent: number;
    status: string;
  };
}

function LivePrizePool({ match }: LivePrizePoolProps) {
  const { filledSlots, entryFee, showcasePrizePool, livePrizePool, hostCut, platformCut, totalPool, winnersPercent, hostPercent, status } = match;

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-amber-400 text-sm">Live Prize Pool</span>
        </div>
        {status === "live" && (
          <span className="text-[10px] font-bold text-green-400 border border-green-400/40 rounded-full px-2 py-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> LIVE
          </span>
        )}
      </div>

      <div className="text-3xl font-bold text-foreground mb-0.5">₹{Math.round(livePrizePool)}</div>
      <p className="text-xs text-muted-foreground mb-3">
        {filledSlots} player{filledSlots !== 1 ? "s" : ""} × ₹{entryFee} entry fee
      </p>

      <div className="grid grid-cols-3 gap-2 text-center bg-secondary/50 rounded-xl p-3">
        <div>
          <div className="text-sm font-bold text-green-400">₹{Math.round(livePrizePool)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Winners</div>
          <div className="text-[10px] text-muted-foreground">{winnersPercent}%</div>
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">₹{Math.round(hostCut)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Host</div>
          <div className="text-[10px] text-muted-foreground">{hostPercent}%</div>
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">₹{Math.round(platformCut)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Platform</div>
          <div className="text-[10px] text-muted-foreground">5%</div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-2.5 flex items-start gap-1">
        <span>ⓘ</span>
        <span>Pool grows as more players join · Guaranteed showcase: ₹{showcasePrizePool}</span>
      </p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export default function MatchDetailPage() {
  const [, params] = useRoute("/matches/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id ?? "0");
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: match, isLoading, refetch } = useGetMatch(matchId);
  const { data: players } = useGetMatchPlayers(matchId);
  const { data: squad } = useGetMySquad({ query: { enabled: !!user } });

  const { mutateAsync: joinMatch, isPending: isJoining } = useJoinMatch();
  const { mutateAsync: updateRoom, isPending: isUpdatingRoom } = useUpdateRoomCredentials();
  const { mutateAsync: goLive, isPending: isGoingLive } = useGoLive();
  const { mutateAsync: deleteMatch, isPending: isDeleting } = useDeleteMatch();

  const [joinOpen, setJoinOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [joinPlayers, setJoinPlayers] = useState([{ ign: "", uid: "" }]);
  const [selectedSquadIds, setSelectedSquadIds] = useState<Set<number>>(new Set());
  const [roomCreds, setRoomCreds] = useState({ roomId: "", roomPassword: "" });

  const isHost = user?.id === match?.hostId;
  const isAdmin = user?.role === "admin";
  const canManage = isHost || isAdmin;

  const handleJoin = async () => {
    if (!match) return;
    let players: { ign: string; uid: string }[];
    if (match.teamSize > 1) {
      const selected = (squad ?? []).filter(m => selectedSquadIds.has(m.id!));
      if (selected.length !== match.teamSize) {
        toast({ title: `Select exactly ${match.teamSize} players`, variant: "destructive" });
        return;
      }
      players = selected.map(m => ({ ign: m.name, uid: m.uid }));
    } else {
      if (joinPlayers.some(p => !p.ign || !p.uid)) {
        toast({ title: "Fill in your player details", variant: "destructive" });
        return;
      }
      players = joinPlayers;
    }
    try {
      await joinMatch({ id: matchId, data: { teamName: teamName || undefined, players } });
      toast({ title: "Joined successfully!" });
      setJoinOpen(false);
      setSelectedSquadIds(new Set());
      refetch();
    } catch (err: any) {
      toast({ title: "Failed to join", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleUpdateRoom = async () => {
    try {
      await updateRoom({ id: matchId, data: roomCreds });
      toast({ title: "Room credentials updated!" });
      setRoomOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Failed to update room", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleGoLive = async () => {
    try {
      await goLive({ id: matchId });
      toast({ title: "Match is now live!" });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this match? All entry fees will be refunded.")) return;
    try {
      await deleteMatch({ id: matchId });
      toast({ title: "Match deleted and refunds processed" });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <AppLayout showBack title="Match Details">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!match) {
    return (
      <AppLayout showBack title="Match Details">
        <div className="text-center py-16 text-muted-foreground">Match not found</div>
      </AppLayout>
    );
  }

  const statusColors = {
    upcoming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    live: "bg-green-500/20 text-green-400 border-green-500/30",
    completed: "bg-muted text-muted-foreground border-border",
  };

  return (
    <AppLayout showBack title="Match Details">
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">{match.game}</h2>
              <p className="text-muted-foreground text-sm">{match.mode} · {match.teamSize}v{match.teamSize}</p>
            </div>
            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", statusColors[match.status])}>
              {match.status === "live" ? "🔴 Live" : match.status}
            </span>
          </div>

          <div className="font-mono text-accent text-sm font-medium mb-4">Match Code: #{match.code}</div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">Entry Fee</div>
              <div className="font-bold text-primary">₹{match.entryFee}</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Users className="w-3 h-3" />Slots</div>
              <div className="font-bold">{match.filledSlots}/{match.slots}</div>
            </div>
          </div>

          <LivePrizePool match={match as any} />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 shrink-0" />
            <span>{formatTime(match.startTime)}</span>
          </div>

          {match.hostHandle && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Shield className="w-4 h-4 shrink-0" />
              <span>Hosted by <span className="text-foreground font-medium">@{match.hostHandle}</span></span>
            </div>
          )}
        </div>

        {match.roomReleased && match.isJoined && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
            <h3 className="font-semibold text-green-400 mb-3">Room Credentials</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-xs text-muted-foreground">Room ID</div>
                  <div className="font-mono font-semibold">{match.roomId}</div>
                </div>
                <CopyButton value={match.roomId ?? ""} />
              </div>
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-xs text-muted-foreground">Password</div>
                  <div className="font-mono font-semibold">{match.roomPassword}</div>
                </div>
                <CopyButton value={match.roomPassword ?? ""} />
              </div>
            </div>
          </div>
        )}

        {!match.isJoined && match.status === "upcoming" && user?.role === "player" && (
          match.teamSize > 1 && (squad ?? []).length < match.teamSize ? (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-center space-y-1">
              <p className="text-sm font-semibold text-destructive">Squad Required</p>
              <p className="text-xs text-muted-foreground">
                This is a {match.teamSize === 2 ? "Duo" : "Squad"} match — you need {match.teamSize} squad members to join.
                You currently have {(squad ?? []).length}. Add more in Profile → My Squad.
              </p>
            </div>
          ) : (
            <Dialog open={joinOpen} onOpenChange={(o) => { setJoinOpen(o); if (!o) setSelectedSquadIds(new Set()); }}>
              <DialogTrigger asChild>
                <Button className="w-full" size="lg">
                  Join Match · ₹{match.entryFee}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Join Match</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {match.teamSize > 1 ? (
                    <>
                      <div className="space-y-1.5">
                        <Label>Team Name (optional)</Label>
                        <Input
                          placeholder="Your team name"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Select {match.teamSize === 2 ? "Duo" : "Squad"} Players</Label>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            selectedSquadIds.size === match.teamSize
                              ? "bg-green-500/20 text-green-400"
                              : "bg-secondary text-muted-foreground"
                          )}>
                            {selectedSquadIds.size}/{match.teamSize} selected
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {(squad ?? []).map((m) => {
                            const isSelected = selectedSquadIds.has(m.id!);
                            return (
                              <button
                                key={m.id}
                                className={cn(
                                  "w-full flex items-center justify-between text-sm rounded-lg px-3 py-2.5 transition-colors border",
                                  isSelected
                                    ? "bg-primary/20 border-primary/50 text-foreground"
                                    : "bg-secondary/50 border-transparent hover:bg-secondary"
                                )}
                                onClick={() => {
                                  setSelectedSquadIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(m.id!)) {
                                      next.delete(m.id!);
                                    } else if (next.size < match.teamSize) {
                                      next.add(m.id!);
                                    }
                                    return next;
                                  });
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                                    isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                                  )}>
                                    {isSelected && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-primary-foreground fill-current"><path d="M1 5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>}
                                  </div>
                                  <span className="font-medium">{m.name}</span>
                                </div>
                                <span className="text-muted-foreground text-xs font-mono">{m.uid}</span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedSquadIds.size === match.teamSize && (
                          <p className="text-xs text-green-400 text-center">All players selected!</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Your Player Info</Label>
                      {joinPlayers.map((p, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            placeholder="IGN"
                            value={p.ign}
                            onChange={(e) => {
                              const next = [...joinPlayers];
                              next[i] = { ...next[i], ign: e.target.value };
                              setJoinPlayers(next);
                            }}
                          />
                          <Input
                            placeholder="UID"
                            value={p.uid}
                            onChange={(e) => {
                              const next = [...joinPlayers];
                              next[i] = { ...next[i], uid: e.target.value };
                              setJoinPlayers(next);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleJoin}
                    disabled={isJoining || (match.teamSize > 1 && selectedSquadIds.size !== match.teamSize)}
                  >
                    {isJoining ? "Joining..." : `Confirm · ₹${match.entryFee}`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )
        )}

        {canManage && (
          <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Host Controls</h3>

            {match.status === "upcoming" && (
              <Button className="w-full" variant="secondary" onClick={handleGoLive} disabled={isGoingLive}>
                {isGoingLive ? "Going live..." : "Go Live"}
              </Button>
            )}

            <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  {match.roomReleased ? "Update Room Credentials" : "Release Room Credentials"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Room Credentials</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Room ID</Label>
                    <Input
                      placeholder="Enter room ID"
                      value={roomCreds.roomId}
                      onChange={(e) => setRoomCreds(r => ({ ...r, roomId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Room Password</Label>
                    <Input
                      placeholder="Enter room password"
                      value={roomCreds.roomPassword}
                      onChange={(e) => setRoomCreds(r => ({ ...r, roomPassword: e.target.value }))}
                    />
                  </div>
                  <Button className="w-full" onClick={handleUpdateRoom} disabled={isUpdatingRoom}>
                    {isUpdatingRoom ? "Saving..." : "Save Credentials"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="destructive" className="w-full" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? "Deleting..." : "Delete Match"}
            </Button>
          </div>
        )}

        {players && players.length > 0 && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <h3 className="font-semibold mb-3">Participants ({players.length})</h3>
            <div className="space-y-2">
              {players.map((team) => (
                <div key={team.id} className="bg-secondary/40 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{team.teamName || `Team ${team.teamNumber}`}</span>
                    <span className="text-xs text-muted-foreground">#{team.teamNumber}</span>
                  </div>
                  <div className="space-y-1">
                    {team.players.map((p) => (
                      <div key={p.position} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{p.ign}</span>
                        <span className="text-muted-foreground font-mono">{p.uid}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
