import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Users, Gift, Clock, Shield, Copy, Check, Trash2, AlertTriangle, Gamepad2, Hash, Swords, Calendar, Star, ChevronRight, BellRing, Trophy, Tv2, ExternalLink, ListChecks, MessageSquare } from "lucide-react";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";
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
  const { filledSlots, entryFee, livePrizePool, hostCut, platformCut, winnersPercent, hostPercent, status } = match;

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-amber-400 text-sm">Live Prize Pool</span>
        </div>
        {status === "live" && (
          <span className="text-[10px] font-bold text-red-400 border border-red-400/40 rounded-full px-2 py-0.5 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
            </span>
            LIVE
          </span>
        )}
      </div>

      <div className="text-3xl font-bold text-foreground mb-0.5"><GoldCoin amount={Math.round(livePrizePool)} size="lg" /></div>
      <p className="text-xs text-muted-foreground mb-3">
        <GoldCoin amount={entryFee} size="sm" /> × {filledSlots} player{filledSlots !== 1 ? "s" : ""} = <GoldCoin amount={filledSlots * entryFee} size="sm" />
      </p>

      <div className="grid grid-cols-3 gap-2 text-center bg-secondary/50 rounded-xl p-3">
        <div>
          <div className="text-sm font-bold text-green-400"><GoldCoin amount={Math.round(livePrizePool)} size="sm" /></div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Winners</div>
          <div className="text-[10px] text-muted-foreground">{winnersPercent}%</div>
        </div>
        <div>
          <div className="text-sm font-bold text-foreground"><GoldCoin amount={Math.round(hostCut)} size="sm" /></div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Host</div>
          <div className="text-[10px] text-muted-foreground">{hostPercent}%</div>
        </div>
        <div>
          <div className="text-sm font-bold text-foreground"><GoldCoin amount={Math.round(platformCut)} size="sm" /></div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Platform</div>
          <div className="text-[10px] text-muted-foreground">{100 - winnersPercent - hostPercent}%</div>
        </div>
      </div>

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

function NotifyMeButton({ matchId }: { matchId: number }) {
  const { toast } = useToast();
  const [notified, setNotified] = useState(false);

  const handleNotify = () => {
    setNotified(true);
    toast({
      title: "You're on the waitlist!",
      description: "We'll notify you if a slot opens up in this match.",
    });
  };

  if (notified) {
    return (
      <div className="flex items-center justify-center gap-2 w-full rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
        <BellRing className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-sm font-medium text-green-400">You'll be notified if a slot opens</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2 w-full rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5">
        <Users className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-sm font-medium text-destructive">Match is Full — All slots taken</span>
      </div>
      <Button variant="outline" className="w-full gap-2" size="lg" onClick={handleNotify}>
        <BellRing className="w-4 h-4" /> Notify Me if a Slot Opens
      </Button>
    </div>
  );
}

type BracketMatch = { id: string; team1: string | null; team2: string | null; winner: string | null };
type BracketRound = { name: string; roundNumber: number; matches: BracketMatch[] };
type BracketData = { rounds: BracketRound[] };

function TournamentBracket({ matchId, canManage }: { matchId: number; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["bracket", matchId],
    queryFn: async () => {
      const res = await fetch(`/api/matches/${matchId}/bracket`, { credentials: "include" });
      if (!res.ok) throw new Error("not found");
      return res.json() as Promise<{ bracketData: BracketData }>;
    },
    retry: false,
  });

  const { mutateAsync: createBracket, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/matches/${matchId}/bracket`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({}),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bracket", matchId] }),
  });

  const { mutateAsync: updateBracket } = useMutation({
    mutationFn: async (bracketData: BracketData) => {
      const res = await fetch(`/api/matches/${matchId}/bracket`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ bracketData }),
      });
      if (!res.ok) throw new Error("Failed to update bracket");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bracket", matchId] }),
  });

  const handleAdvance = async (roundIdx: number, matchIdx: number, winner: string) => {
    if (!data?.bracketData) return;
    const bd: BracketData = JSON.parse(JSON.stringify(data.bracketData));
    bd.rounds[roundIdx].matches[matchIdx].winner = winner;
    if (roundIdx + 1 < bd.rounds.length) {
      const nextMatchIdx = Math.floor(matchIdx / 2);
      const isTeam1Slot = matchIdx % 2 === 0;
      if (isTeam1Slot) { bd.rounds[roundIdx + 1].matches[nextMatchIdx].team1 = winner; }
      else { bd.rounds[roundIdx + 1].matches[nextMatchIdx].team2 = winner; }
    }
    try { await updateBracket(bd); }
    catch { toast({ title: "Failed to advance team", variant: "destructive" }); }
  };

  if (isLoading) return (
    <div className="h-16 flex items-center justify-center">
      <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  if (error || !data) {
    if (!canManage) return (
      <p className="text-sm text-muted-foreground text-center py-4">Tournament bracket hasn't been set up yet.</p>
    );
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground mb-3">Seed all joined teams into the bracket to get started.</p>
        <Button size="sm" onClick={async () => {
          try { await createBracket(); toast({ title: "Bracket created! 🏆" }); }
          catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
        }} disabled={isCreating}>
          {isCreating ? "Creating..." : "Generate Bracket"}
        </Button>
      </div>
    );
  }

  const { rounds } = data.bracketData;
  const CARD_H = 72;

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div className="flex gap-3 min-w-max items-start">
        {rounds.map((round, rIdx) => {
          const spacing = rIdx === 0 ? 8 : (CARD_H + 8) * Math.pow(2, rIdx) - CARD_H;
          return (
            <div key={round.roundNumber} className="flex flex-col" style={{ minWidth: 152 }}>
              <div className="text-[10px] font-bold text-primary/80 text-center mb-2 uppercase tracking-widest">{round.name}</div>
              <div className="flex flex-col" style={{ gap: spacing }}>
                {round.matches.map((m, mIdx) => (
                  <div key={m.id} className="rounded-xl border border-card-border overflow-hidden bg-card shadow-sm" style={{ minWidth: 152 }}>
                    {([{ team: m.team1 }, { team: m.team2 }] as { team: string | null }[]).map(({ team }, tIdx) => (
                      <button
                        key={tIdx}
                        disabled={!canManage || !team || m.winner !== null}
                        onClick={() => team && handleAdvance(rIdx, mIdx, team)}
                        className={cn(
                          "w-full flex items-center gap-1.5 px-3 text-left text-xs transition-all",
                          tIdx === 0 ? "pt-2.5 pb-1.5 border-b border-card-border/60" : "pt-1.5 pb-2.5",
                          m.winner === team && team
                            ? "text-green-400 font-semibold"
                            : m.winner && m.winner !== team
                            ? "text-muted-foreground/40 line-through"
                            : "text-foreground",
                          canManage && team && !m.winner ? "hover:bg-primary/10 cursor-pointer" : "cursor-default"
                        )}
                      >
                        {m.winner === team && team && (
                          <Check className="w-3 h-3 shrink-0 text-green-400" />
                        )}
                        <span className="truncate max-w-[108px]">{team ?? <span className="text-muted-foreground/50 italic">TBD</span>}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {rounds[rounds.length - 1]?.matches[0]?.winner && (
          <div className="flex flex-col items-center justify-center self-center ml-2">
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center mb-1">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wide">Champion</span>
            <span className="text-xs font-semibold text-foreground mt-0.5 max-w-[80px] text-center truncate">
              {rounds[rounds.length - 1].matches[0].winner}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const [, params] = useRoute("/matches/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id ?? "0", 10) || 0;
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: match, isLoading, refetch } = useGetMatch(matchId);
  const { data: players } = useGetMatchPlayers(matchId);
  const { data: squadRaw } = useGetMySquad({ query: { enabled: !!user } as any });
  // Filter squad to only show members matching the match's game
  const squad = match ? (squadRaw ?? []).filter(m => !m.game || m.game === match.game) : (squadRaw ?? []);

  const { mutateAsync: joinMatch, isPending: isJoining } = useJoinMatch();
  const { mutateAsync: updateRoom, isPending: isUpdatingRoom } = useUpdateRoomCredentials();
  const { mutateAsync: goLive, isPending: isGoingLive } = useGoLive();
  const { mutateAsync: deleteMatch, isPending: isDeleting } = useDeleteMatch();

  const [joinOpen, setJoinOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [joinPlayers, setJoinPlayers] = useState<{ ign: string; uid: string }[]>([]);
  const [selectedSquadIds, setSelectedSquadIds] = useState<Set<number>>(new Set());
  const [soloSquadId, setSoloSquadId] = useState<number | null>(null);
  const [soloManual, setSoloManual] = useState({ ign: "", uid: "" });
  const [roomCreds, setRoomCreds] = useState({ roomId: "", roomPassword: "" });

  const isHost = user?.id === match?.hostId;
  const isAdmin = user?.role === "admin";
  const canManage = isHost || isAdmin;

  const handleJoin = async () => {
    if (!match) return;
    let players: { ign: string; uid: string }[];
    if (match.teamSize === 1) {
      if (soloSquadId !== null) {
        const member = (squad ?? []).find(m => m.id === soloSquadId);
        if (!member) { toast({ title: "Squad member not found", variant: "destructive" }); return; }
        players = [{ ign: member.name, uid: member.uid }];
      } else {
        if (!soloManual.ign || !soloManual.uid) {
          toast({ title: "Fill in your IGN and UID", variant: "destructive" });
          return;
        }
        players = [{ ign: soloManual.ign, uid: soloManual.uid }];
      }
    } else {
      const squadPlayers = (squad ?? [])
        .filter(m => selectedSquadIds.has(m.id!))
        .map(m => ({ ign: m.name, uid: m.uid }));
      const remaining = match.teamSize - squadPlayers.length;
      const manualFilled = joinPlayers.slice(0, remaining).filter(p => p.ign && p.uid);
      players = [...squadPlayers, ...manualFilled];
      if (players.length !== match.teamSize) {
        toast({ title: `Fill all ${match.teamSize} player slots`, variant: "destructive" });
        return;
      }
    }
    // Check for duplicate UIDs within the submitted players list
    const uids = players.map(p => p.uid.trim()).filter(Boolean);
    const uniqueUids = new Set(uids);
    if (uniqueUids.size !== uids.length) {
      toast({ title: "Duplicate UID", description: "Each player must have a unique UID. Please check and correct.", variant: "destructive" });
      return;
    }

    try {
      await joinMatch({ id: matchId, data: { teamName: teamName || undefined, players } });
      toast({ title: "Joined successfully!" });
      setJoinOpen(false);
      setSelectedSquadIds(new Set());
      setSoloSquadId(null);
      setSoloManual({ ign: "", uid: "" });
      setJoinPlayers([]);
      refetch();
    } catch (err: any) {
      toast({ title: "Failed to join", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleUpdateRoom = async () => {
    try {
      await updateRoom({ id: matchId, data: roomCreds });
      toast({ title: "Room credentials updated!" });
      setRoomOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Failed to update room", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleGoLive = async () => {
    try {
      await goLive({ id: matchId });
      toast({ title: "Match is now live!" });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this match? All entry fees will be refunded.")) return;
    try {
      await deleteMatch({ id: matchId });
      toast({ title: "Match deleted and refunds processed" });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const backHref = user?.role === "host" ? "/host" : "/";

  if (isLoading) {
    return (
      <AppLayout showBack backHref={backHref} title="Match Details">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!match) {
    return (
      <AppLayout showBack backHref={backHref} title="Match Details">
        <div className="text-center py-16 text-muted-foreground">Match not found</div>
      </AppLayout>
    );
  }

  const statusColors = {
    upcoming: "bg-primary/20 text-primary border-primary/30",
    live: "bg-red-500/10 text-red-400 border-red-500/20",
    completed: "bg-muted text-muted-foreground border-border",
  };

  const thumbnail = (match as any).thumbnailImage;
  const slotsLeft = match.slots - match.filledSlots;

  return (
    <AppLayout showBack backHref={backHref} title="Match Details">
      <div className="space-y-3 pb-4">

        {/* ── HERO SECTION ── */}
        <div className="relative rounded-2xl overflow-hidden border border-card-border bg-card">
          {thumbnail ? (
            <div className="relative h-44 w-full">
              <img src={thumbnail} alt="Match" className="w-full h-full object-cover [object-position:center_20%]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white drop-shadow">{match.game}</h2>
                    <p className="text-white/70 text-sm">{match.mode} · {match.teamSize === 1 ? "Solo" : match.teamSize === 2 ? "Duo" : match.teamSize === 4 ? "Squad" : `${match.teamSize}v${match.teamSize}`}{(match as any).map ? ` · 🗺️ ${(match as any).map}` : ""}</p>
                  </div>
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border backdrop-blur-sm flex items-center gap-1.5", statusColors[match.status])}>
                    {match.status === "live" ? (
                      <>
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                        LIVE
                      </>
                    ) : match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{match.game}</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">{match.mode} · {match.teamSize === 1 ? "Solo" : match.teamSize === 2 ? "Duo" : match.teamSize === 4 ? "Squad" : `${match.teamSize}v${match.teamSize}`}{(match as any).map ? ` · 🗺️ ${(match as any).map}` : ""}</p>
                </div>
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5", statusColors[match.status])}>
                  {match.status === "live" ? (
                    <>
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      LIVE
                    </>
                  ) : match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                </span>
              </div>
            </div>
          )}

          {/* Match code + description strip */}
          <div className={cn("px-4 py-3 border-t border-card-border", thumbnail ? "" : "")}>
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="font-mono text-accent text-sm font-semibold">{match.code}</span>
              <span className="text-muted-foreground text-xs ml-1">Match Code</span>
            </div>
            {(match as any).description && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">{(match as any).description}</p>
            )}
            {(match as any).streamLink && (
              <a
                href={(match as any).streamLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 w-full bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5 hover:bg-red-500/15 transition-colors"
              >
                <Tv2 className="w-4 h-4 text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-red-400">Live Stream Available</p>
                  <p className="text-[11px] text-muted-foreground truncate">{(match as any).streamLink}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </a>
            )}
            {Array.isArray((match as any).customRules) && (match as any).customRules.length > 0 && (
              <div className="mt-3 rounded-xl bg-secondary/40 border border-border px-3 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ListChecks className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Match Rules</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(match as any).customRules.map((rule: string, i: number) => (
                    <span key={i} className="text-xs bg-card border border-border px-2.5 py-1 rounded-full text-foreground">
                      {rule}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-card border border-card-border rounded-2xl p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Entry</div>
            <div className="font-bold text-primary text-sm flex items-center justify-center gap-0.5">
              <GoldCoinIcon size="sm" />{match.entryFee}
            </div>
            {match.teamSize > 1 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">per player</div>
            )}
          </div>
          <div className="bg-card border border-card-border rounded-2xl p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Slots</div>
            <div className={cn("font-bold text-sm", slotsLeft === 0 ? "text-destructive" : "text-foreground")}>
              {match.filledSlots}/{match.slots}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{slotsLeft === 0 ? "Full" : `${slotsLeft} left`}</div>
          </div>
          <div className="bg-card border border-card-border rounded-2xl p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Mode</div>
            <div className="font-bold text-sm flex items-center justify-center gap-1">
              <Swords className="w-3 h-3 text-muted-foreground" />
              {match.teamSize === 1 ? "Solo" : match.teamSize === 2 ? "Duo" : match.teamSize === 4 ? "Squad" : `${match.teamSize}p`}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{match.mode}</div>
          </div>
        </div>

        {/* ── PRIZE POOL ── */}
        <LivePrizePool match={match as any} />

        {/* ── SCHEDULE & HOST ── */}
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Schedule & Host</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Start Time</p>
              <p className="text-sm font-medium">{formatTime(match.startTime)}</p>
            </div>
          </div>
          {match.hostHandle && (
            <button
              type="button"
              onClick={() => navigate(`/profile/${match.hostHandle}`)}
              className="w-full flex items-center gap-3 bg-secondary/40 hover:bg-secondary/70 transition-colors rounded-xl px-3 py-2.5 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden text-lg">
                {(match as any).hostAvatar && ((match as any).hostAvatar.startsWith("/") || (match as any).hostAvatar.startsWith("http"))
                  ? <img src={(match as any).hostAvatar} alt="" className="w-full h-full object-cover" />
                  : ((match as any).hostAvatar ?? "🛡️")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold truncate">{(match as any).hostName || `@${match.hostHandle}`}</p>
                  <Shield className="w-3 h-3 text-primary shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">@{match.hostHandle}</span>
                  {((match as any).hostFollowers ?? 0) > 0 && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                      <Users className="w-3 h-3" /> {(match as any).hostFollowers}
                    </span>
                  )}
                  {(match as any).hostRating != null && (match as any).hostReviewCount > 0 && (
                    <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {((match as any).hostRating as number).toFixed(1)}
                      <span className="text-muted-foreground">({(match as any).hostReviewCount})</span>
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          )}
          {/* Slot fill bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{match.filledSlots} joined</span>
              <span>{match.slots} total slots</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", slotsLeft === 0 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min((match.filledSlots / match.slots) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {user?.role === "player" && match.isJoined && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 leading-relaxed">
              <span className="font-semibold">Slot Warning:</span> Slots are fixed as shown. If you join another player's or team's slot, you will be removed from the match.
            </p>
          </div>
        )}

        {(match.isJoined || canManage) && (match as any).groupId && (
          <button
            onClick={() => navigate(`/chat/group/${(match as any).groupId}`)}
            className="w-full flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/15 transition-colors rounded-2xl px-4 py-3"
          >
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-violet-400">Match Group Chat</p>
              <p className="text-xs text-muted-foreground">Chat with other players in this match</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        )}

        {match.roomReleased && match.isJoined && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
            <h3 className="font-semibold text-purple-400 mb-3">Room Credentials</h3>
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

        {!match.isJoined && match.status === "upcoming" && user?.role === "player" && slotsLeft === 0 && (
          <NotifyMeButton matchId={matchId} />
        )}

        {!match.isJoined && match.status === "upcoming" && user?.role === "player" && slotsLeft > 0 && (
          (
            <Dialog open={joinOpen} onOpenChange={(o) => { setJoinOpen(o); if (!o) { setSelectedSquadIds(new Set()); setTeamName(""); setJoinPlayers([]); setSoloSquadId(null); setSoloManual({ ign: "", uid: "" }); } }}>
              <DialogTrigger asChild>
                <Button className="w-full" size="lg">
                  Join Match · <GoldCoin amount={match.teamSize > 1 ? (Number(match.entryFee) || 0) * match.teamSize : match.entryFee} size="sm" />
                  {match.teamSize > 1 && <span className="opacity-70 text-xs ml-1">({match.entryFee} × {match.teamSize})</span>}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Join Match</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {match.teamSize === 1 ? (
                    /* ── SOLO ── */
                    <div className="space-y-3">
                      {(squad ?? []).length > 0 && (
                        <>
                          <Label>Pick from My Squad</Label>
                          <div className="space-y-1.5">
                            {(squad ?? []).map((m) => {
                              const isSelected = soloSquadId === m.id;
                              return (
                                <button
                                  key={m.id}
                                  className={cn(
                                    "w-full flex items-center justify-between text-sm rounded-lg px-3 py-2.5 transition-colors border",
                                    isSelected
                                      ? "bg-primary/20 border-primary/50 text-foreground"
                                      : "bg-secondary/50 border-transparent hover:bg-secondary"
                                  )}
                                  onClick={() => { setSoloSquadId(isSelected ? null : m.id!); setSoloManual({ ign: "", uid: "" }); }}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={cn(
                                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                      isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                                    )}>
                                      {isSelected && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                                    </div>
                                    <span className="font-medium">{m.name}</span>
                                  </div>
                                  <span className="text-muted-foreground text-xs font-mono">{m.uid}</span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                            <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or enter manually</span></div>
                          </div>
                        </>
                      )}
                      <div className="space-y-1.5">
                        {(squad ?? []).length === 0 && <Label>Your Player Info</Label>}
                        <div className="flex gap-2">
                          <Input
                            placeholder="IGN"
                            value={soloManual.ign}
                            disabled={soloSquadId !== null}
                            onChange={(e) => { setSoloManual(f => ({ ...f, ign: e.target.value })); setSoloSquadId(null); }}
                          />
                          <Input
                            placeholder="UID"
                            value={soloManual.uid}
                            disabled={soloSquadId !== null}
                            onChange={(e) => { setSoloManual(f => ({ ...f, uid: e.target.value })); setSoloSquadId(null); }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── TEAM / DUO ── */
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
                            selectedSquadIds.size + joinPlayers.filter(p => p.ign && p.uid).length === match.teamSize
                              ? "bg-green-500/20 text-green-400"
                              : "bg-secondary text-muted-foreground"
                          )}>
                            {selectedSquadIds.size + joinPlayers.filter(p => p.ign && p.uid).length}/{match.teamSize}
                          </span>
                        </div>
                        {(squad ?? []).length > 0 && (
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
                                      if (next.has(m.id!)) { next.delete(m.id!); }
                                      else if (next.size < match.teamSize) { next.add(m.id!); }
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
                        )}
                        {/* Manual slots for remaining players not in squad */}
                        {(() => {
                          const remaining = match.teamSize - selectedSquadIds.size;
                          if (remaining <= 0) return null;
                          return (
                            <div className="space-y-1.5">
                              {remaining < match.teamSize && (
                                <div className="relative">
                                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                                  <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">add {remaining} more manually</span></div>
                                </div>
                              )}
                              {remaining === match.teamSize && (squad ?? []).length > 0 && (
                                <p className="text-xs text-muted-foreground">Or add players manually below</p>
                              )}
                              {Array.from({ length: remaining }).map((_, i) => (
                                <div key={i} className="flex gap-2">
                                  <Input
                                    placeholder={`Player ${i + 1} IGN`}
                                    value={joinPlayers[i]?.ign ?? ""}
                                    onChange={(e) => {
                                      const next = Array.from({ length: remaining }, (_, j) => joinPlayers[j] ?? { ign: "", uid: "" });
                                      next[i] = { ...next[i], ign: e.target.value };
                                      setJoinPlayers(next);
                                    }}
                                  />
                                  <Input
                                    placeholder="UID"
                                    value={joinPlayers[i]?.uid ?? ""}
                                    onChange={(e) => {
                                      const next = Array.from({ length: remaining }, (_, j) => joinPlayers[j] ?? { ign: "", uid: "" });
                                      next[i] = { ...next[i], uid: e.target.value };
                                      setJoinPlayers(next);
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleJoin}
                    disabled={isJoining || (
                      match.teamSize === 1
                        ? (soloSquadId === null && (!soloManual.ign || !soloManual.uid))
                        : (selectedSquadIds.size + joinPlayers.filter(p => p.ign && p.uid).length !== match.teamSize)
                    )}
                  >
                    {isJoining ? "Joining..." : <span className="inline-flex items-center gap-1">Confirm · <GoldCoin amount={match.teamSize > 1 ? Number(match.entryFee) * match.teamSize : match.entryFee} /></span>}
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

        {match?.isEsportsOnly && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <h3 className="font-semibold text-sm">Tournament Bracket</h3>
              <span className="ml-auto text-[10px] font-bold text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 rounded-full px-2 py-0.5 uppercase tracking-wide">Esports</span>
            </div>
            <TournamentBracket matchId={matchId} canManage={canManage} />
          </div>
        )}

        {players && players.length > 0 && (() => {
          const isCompleted = match?.status === "completed";
          const sorted = isCompleted
            ? [...players].sort((a, b) => {
                if (a.rank == null && b.rank == null) return (a.teamNumber ?? 0) - (b.teamNumber ?? 0);
                if (a.rank == null) return 1;
                if (b.rank == null) return -1;
                return a.rank - b.rank;
              })
            : players;

          const rankLabel = (rank: number | null) => {
            if (!rank) return null;
            if (rank === 1) return { icon: "🥇", label: "1st", color: "text-yellow-400" };
            if (rank === 2) return { icon: "🥈", label: "2nd", color: "text-slate-300" };
            if (rank === 3) return { icon: "🥉", label: "3rd", color: "text-amber-600" };
            return { icon: `#${rank}`, label: `#${rank}`, color: "text-muted-foreground" };
          };

          return (
            <div className="bg-card border border-card-border rounded-2xl p-4">
              <h3 className="font-semibold mb-3">
                {isCompleted ? "Results & Rewards" : `Participants (${players.length})`}
              </h3>
              <div className="space-y-2">
                {sorted.map((team) => {
                  const rl = rankLabel(team.rank ?? null);
                  const hasReward = isCompleted && team.reward != null && team.reward > 0;
                  return (
                    <div
                      key={team.id}
                      className={`rounded-xl p-3 border ${
                        rl?.label === "1st" ? "bg-yellow-500/10 border-yellow-500/30" :
                        rl?.label === "2nd" ? "bg-slate-400/10 border-slate-400/20" :
                        rl?.label === "3rd" ? "bg-amber-700/10 border-amber-700/20" :
                        "bg-secondary/40 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          {rl && (
                            <span className={`text-sm font-bold ${rl.color}`}>{rl.icon}</span>
                          )}
                          <span className="text-sm font-medium">{team.teamName || `Team ${team.teamNumber}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasReward && (
                            <span className="text-xs font-bold text-green-400 flex items-center gap-0.5">
                              +<GoldCoin amount={team.reward!} size="sm" />
                            </span>
                          )}
                          {isCompleted && team.reward === 0 && (
                            <span className="text-xs text-muted-foreground">No reward</span>
                          )}
                          {!isCompleted && (
                            <span className="text-xs text-muted-foreground">#{team.teamNumber}</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {team.players.map((p) => (
                          <div key={p.position} className="flex items-center justify-between text-xs">
                            <span className="text-foreground">{p.ign}</span>
                            <span className="text-muted-foreground font-mono">{p.uid}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </AppLayout>
  );
}
