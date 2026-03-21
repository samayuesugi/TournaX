import { useState } from "react";
import { useRoute } from "wouter";
import { Users, Trophy, Clock, Shield, Copy, Check, Plus, Trash2 } from "lucide-react";
import {
  useGetMatch, useJoinMatch, useGetMatchPlayers, useUpdateRoomCredentials,
  useGoLive, useDeleteMatch, useGetMySquad
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
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
  const [roomCreds, setRoomCreds] = useState({ roomId: "", roomPassword: "" });

  const isHost = user?.id === match?.hostId;
  const isAdmin = user?.role === "admin";
  const canManage = isHost || isAdmin;

  const handleJoin = async () => {
    if (joinPlayers.some(p => !p.ign || !p.uid)) {
      toast({ title: "Fill in all player details", variant: "destructive" });
      return;
    }
    try {
      await joinMatch({ id: matchId, data: { teamName: teamName || undefined, players: joinPlayers } });
      toast({ title: "Joined successfully!" });
      setJoinOpen(false);
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
      history.back();
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

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">Entry Fee</div>
              <div className="font-bold text-primary">₹{match.entryFee}</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Trophy className="w-3 h-3" />Prize</div>
              <div className="font-bold text-accent">₹{match.prizePool}</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Users className="w-3 h-3" />Slots</div>
              <div className="font-bold">{match.filledSlots}/{match.slots}</div>
            </div>
          </div>

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
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
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
                {match.teamSize > 1 && (
                  <div className="space-y-1.5">
                    <Label>Team Name (optional)</Label>
                    <Input
                      placeholder="Your team name"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Players ({match.teamSize} required)</Label>
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
                  {joinPlayers.length < match.teamSize && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setJoinPlayers(p => [...p, { ign: "", uid: "" }])}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Player
                    </Button>
                  )}
                </div>

                {squad && squad.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Or pick from squad</Label>
                    <div className="space-y-1">
                      {squad.map((m) => (
                        <button
                          key={m.id}
                          className="w-full flex items-center justify-between text-sm bg-secondary/50 hover:bg-secondary rounded-lg px-3 py-2 transition-colors"
                          onClick={() => {
                            const next = [...joinPlayers];
                            const emptyIdx = next.findIndex(p => !p.ign);
                            if (emptyIdx !== -1) {
                              next[emptyIdx] = { ign: m.name, uid: m.uid };
                              setJoinPlayers(next);
                            }
                          }}
                        >
                          <span>{m.name}</span>
                          <span className="text-muted-foreground text-xs">{m.uid}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button className="w-full" onClick={handleJoin} disabled={isJoining}>
                  {isJoining ? "Joining..." : `Confirm · ₹${match.entryFee}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
