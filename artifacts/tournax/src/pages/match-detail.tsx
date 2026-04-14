import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Users, Gift, Clock, Shield, Copy, Check, Trash2, AlertTriangle, Gamepad2, Hash, Swords, Calendar, Star, ChevronRight, BellRing, Trophy, Tv2, ExternalLink, ListChecks, MessageSquare, Send, KeyRound, Info, UserCheck } from "lucide-react";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";
import {
  useGetMatch, useJoinMatch, useGetMatchPlayers, useUpdateRoomCredentials,
  useGoLive, useDeleteMatch, useGetMySquad, customFetch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { useSocket } from "@/contexts/SocketContext";
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

function maskUid(uid: string) {
  if (!uid) return "";
  if (uid.length <= 4) return uid;
  return "•".repeat(uid.length - 4) + uid.slice(-4);
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
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors p-1">
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

interface GroupMessage {
  id: number;
  groupId: number;
  fromUserId: number;
  senderName: string;
  senderHandle: string;
  senderAvatar: string;
  content: string;
  createdAt: string;
}

function MsgAvatar({ avatar }: { avatar?: string | null }) {
  if (avatar && (avatar.startsWith("/") || avatar.startsWith("http"))) {
    const src = avatar.startsWith("/objects/") ? `/api/storage${avatar}` : avatar;
    return <img src={src} alt="avatar" className="w-7 h-7 rounded-full object-cover bg-secondary shrink-0 self-end" />;
  }
  return <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-sm shrink-0 self-end">{avatar || "🔥"}</div>;
}

function MatchGroupChat({ groupId, currentUser }: { groupId: number; currentUser: any }) {
  const socket = useSocket();
  const { toast } = useToast();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [optimistic, setOptimistic] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstLoad = useRef(true);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await customFetch<GroupMessage[]>(`/api/groups/${groupId}/messages`);
      setMessages(data);
      setLoaded(true);
    } catch { setLoaded(true); }
  }, [groupId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("join:group", { groupId });
    const handler = (msg: GroupMessage) => {
      if (msg.groupId !== groupId) return;
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      setOptimistic((prev) => prev.filter((o) => !(o.content === msg.content && o.fromUserId === msg.fromUserId)));
    };
    socket.on("group:message", handler);
    return () => { socket.off("group:message", handler); };
  }, [socket, groupId]);

  const allMsgs = [
    ...messages,
    ...optimistic.filter((o) => !messages.some((s) => s.content === o.content && s.fromUserId === o.fromUserId)),
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isFirstLoad.current ? "instant" : "smooth" });
    isFirstLoad.current = false;
  }, [allMsgs.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setText("");
    inputRef.current?.focus();
    const opt: GroupMessage = {
      id: Date.now(), groupId, fromUserId: currentUser.id,
      senderName: currentUser.name || currentUser.handle || "",
      senderHandle: currentUser.handle || "",
      senderAvatar: currentUser.avatar || "🔥",
      content: trimmed, createdAt: new Date().toISOString(),
    };
    setOptimistic((prev) => [...prev, opt]);
    setIsSending(true);
    try {
      await customFetch(`/api/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify({ content: trimmed }) });
      if (!socket) { setOptimistic([]); await fetchMessages(); }
    } catch (err: any) {
      setOptimistic((prev) => prev.filter((m) => m.id !== opt.id));
      toast({ title: "Error", description: err?.data?.error || "Failed to send", variant: "destructive" });
    } finally { setIsSending(false); }
  }, [text, isSending, groupId, currentUser, socket, fetchMessages, toast]);

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ overscrollBehavior: "contain" }}>
        {!loaded && (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          </div>
        )}
        {loaded && allMsgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-violet-400 opacity-60" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Be the first to say something!</p>
            </div>
          </div>
        )}
        {loaded && (() => {
          let lastDate = "";
          return allMsgs.map((msg, idx) => {
            const isMe = msg.fromUserId === currentUser.id;
            const msgDate = new Date(msg.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
            const showDate = msgDate !== lastDate;
            lastDate = msgDate;
            const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const prev = allMsgs[idx - 1];
            const next = allMsgs[idx + 1];
            const isFirst = !prev || prev.fromUserId !== msg.fromUserId;
            const isLast = !next || next.fromUserId !== msg.fromUserId;
            return (
              <div key={msg.id} className={cn("animate-in fade-in duration-200", isLast ? "mb-2" : "mb-0.5")}>
                {showDate && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="text-[10px] text-muted-foreground bg-secondary/80 px-2.5 py-0.5 rounded-full">{msgDate}</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                )}
                <div className={cn("flex items-end gap-1.5", isMe ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn("w-6 shrink-0", !isMe ? (isLast ? "visible" : "invisible") : "hidden")}>
                    {!isMe && isLast && <MsgAvatar avatar={msg.senderAvatar} />}
                  </div>
                  <div className={cn("flex flex-col max-w-[75%]", isMe ? "items-end" : "items-start")}>
                    {!isMe && isFirst && (
                      <span className="text-[10px] font-medium text-muted-foreground mb-0.5 ml-1">{msg.senderName || msg.senderHandle}</span>
                    )}
                    <div className={cn(
                      "px-3 py-2 text-sm leading-relaxed break-words",
                      isMe
                        ? "bg-violet-600 text-white"
                        : "bg-secondary text-foreground",
                      isMe
                        ? (isFirst && isLast ? "rounded-2xl" : isFirst ? "rounded-2xl rounded-br-md" : isLast ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-r-md")
                        : (isFirst && isLast ? "rounded-2xl" : isFirst ? "rounded-2xl rounded-bl-md" : isLast ? "rounded-2xl rounded-tl-md" : "rounded-2xl rounded-l-md")
                    )}>
                      {msg.content}
                    </div>
                    {isLast && (
                      <span className="text-[10px] text-muted-foreground mt-0.5 mx-1">{time}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          });
        })()}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-card-border shrink-0">
        <div className="flex gap-2 items-center bg-secondary/50 rounded-2xl px-3 py-1.5 border border-border/50 focus-within:border-violet-500/40 focus-within:bg-secondary/80 transition-all">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message squad..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1 min-w-0"
          />
          <button
            onClick={handleSend}
            disabled={isSending || !text.trim()}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all",
              text.trim() ? "bg-violet-600 text-white hover:bg-violet-700 scale-100" : "bg-transparent text-muted-foreground scale-90 opacity-50"
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifyMeButton({ matchId }: { matchId: number }) {
  const { toast } = useToast();
  const [notified, setNotified] = useState(false);

  const handleNotify = () => {
    setNotified(true);
    toast({ title: "You're on the waitlist!", description: "We'll notify you if a slot opens up in this match." });
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

function useCountdown(targetIso: string) {
  const getRemaining = () => Math.max(0, new Date(targetIso).getTime() - Date.now());
  const [ms, setMs] = useState(getRemaining);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => setMs(getRemaining()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s, done: ms <= 0 };
}

function InlineCountdown({ startTime }: { startTime: string }) {
  const { h, m, s, done } = useCountdown(startTime);
  if (done) return <span className="font-mono tracking-wider">Soon</span>;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono tracking-wider">
      {h > 0 ? `${pad(h)}:` : ""}{pad(m)}:{pad(s)}
    </span>
  );
}

function MatchCountdown({ startTime, status }: { startTime: string; status: string }) {
  const { h, m, s, done } = useCountdown(startTime);
  if (status === "live") {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 border-t border-red-500/20">
        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
        <span className="text-red-400 text-sm font-bold tracking-wide">MATCH IS LIVE</span>
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-muted/40 border-t border-card-border">
        <span className="text-muted-foreground text-sm font-medium">Match Ended</span>
      </div>
    );
  }
  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/20">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-amber-400 text-sm font-bold">Starting Soon...</span>
      </div>
    );
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-t border-primary/20">
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] text-primary font-medium uppercase tracking-wide">Match Starts In</span>
      </div>
      <div className="flex items-center gap-1 font-mono font-bold text-sm">
        {h > 0 && (
          <>
            <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-lg">{pad(h)}h</span>
            <span className="text-primary/50">:</span>
          </>
        )}
        <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-lg">{pad(m)}m</span>
        <span className="text-primary/50">:</span>
        <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-lg">{pad(s)}s</span>
      </div>
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
      const res = await customFetch(`/api/matches/${matchId}/bracket`);
      if (!res.ok) throw new Error("not found");
      return res.json() as Promise<{ bracketData: BracketData }>;
    },
    retry: false,
  });

  const { mutateAsync: createBracket, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      const res = await customFetch(`/api/matches/${matchId}/bracket`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bracket", matchId] }),
  });

  const { mutateAsync: updateBracket } = useMutation({
    mutationFn: async (bracketData: BracketData) => {
      const res = await customFetch(`/api/matches/${matchId}/bracket`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bracketData }),
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
                          m.winner === team && team ? "text-green-400 font-semibold"
                            : m.winner && m.winner !== team ? "text-muted-foreground/40 line-through"
                            : "text-foreground",
                          canManage && team && !m.winner ? "hover:bg-primary/10 cursor-pointer" : "cursor-default"
                        )}
                      >
                        {m.winner === team && team && <Check className="w-3 h-3 shrink-0 text-green-400" />}
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

type Tab = "info" | "chat" | "players" | "leaderboard";

export default function MatchDetailPage() {
  const [, params] = useRoute("/matches/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id ?? "0", 10) || 0;
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("info");

  const { data: match, isLoading, refetch } = useGetMatch(matchId);
  const { data: players } = useGetMatchPlayers(matchId);
  const { data: squadRaw } = useGetMySquad({ query: { enabled: !!user } as any });
  const squad = match ? (squadRaw ?? []).filter(m => !(m as any).game || (m as any).game === match.game) : (squadRaw ?? []);

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
  const [lbEdits, setLbEdits] = useState<Record<number, { kills: string; rank: string }>>({});
  const [isSavingLB, setIsSavingLB] = useState(false);

  const socket = useSocket();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!socket || !matchId) return;
    const onUpdated = (data: { id: number }) => {
      if (data.id !== matchId) return;
      queryClient.invalidateQueries({ queryKey: ["getMatch", matchId] });
      queryClient.invalidateQueries({ queryKey: ["getMatchPlayers", matchId] });
      refetch();
    };
    const onDeleted = (data: { id: number }) => {
      if (data.id !== matchId) return;
      toast({ title: "This match has been deleted by the host.", variant: "destructive" });
      navigate("/");
    };
    const onLeaderboard = (data: { matchId: number }) => {
      if (data.matchId !== matchId) return;
      queryClient.invalidateQueries({ queryKey: ["getMatchPlayers", matchId] });
    };
    socket.on("match:updated", onUpdated);
    socket.on("match:deleted", onDeleted);
    socket.on("match:leaderboard", onLeaderboard);
    return () => {
      socket.off("match:updated", onUpdated);
      socket.off("match:deleted", onDeleted);
      socket.off("match:leaderboard", onLeaderboard);
    };
  }, [socket, matchId]);

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
      const squadPlayers = (squad ?? []).filter(m => selectedSquadIds.has(m.id!)).map(m => ({ ign: m.name, uid: m.uid }));
      const remaining = match.teamSize - squadPlayers.length;
      const manualFilled = joinPlayers.slice(0, remaining).filter(p => p.ign && p.uid);
      players = [...squadPlayers, ...manualFilled];
      if (players.length !== match.teamSize) {
        toast({ title: `Fill all ${match.teamSize} player slots`, variant: "destructive" });
        return;
      }
    }
    const uids = players.map(p => p.uid.trim()).filter(Boolean);
    const uniqueUids = new Set(uids);
    if (uniqueUids.size !== uids.length) {
      toast({ title: "Duplicate UID", description: "Each player must have a unique UID.", variant: "destructive" });
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
  const canChat = (match.isJoined || canManage) && (match as any).groupId && user;
  const credsReleased = match.roomReleased && match.isJoined;

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "info", label: "Info", icon: Info },
    ...(match.status !== "upcoming" ? [{ id: "leaderboard" as Tab, label: "Leaderboard", icon: Trophy }] : []),
    { id: "chat", label: "Chat & Creds", icon: MessageSquare },
    { id: "players", label: "Players", icon: Users, badge: match.filledSlots },
  ];

  return (
    <AppLayout showBack backHref={backHref} title="Match Details">
      {/* ── HERO BANNER ── */}
      <div className="relative rounded-2xl overflow-hidden border border-card-border bg-card mb-3">
        {thumbnail ? (
          <div className="relative h-40 w-full">
            <img src={thumbnail} alt="Match" className="w-full h-full object-cover [object-position:center_20%]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white drop-shadow">{match.game}</h2>
                  <p className="text-white/70 text-sm">
                    {match.mode} · {match.teamSize === 1 ? "Solo" : match.teamSize === 2 ? "Duo" : match.teamSize === 4 ? "Squad" : `${match.teamSize}v${match.teamSize}`}
                    {(match as any).map ? ` · ${(match as any).map}` : ""}
                  </p>
                </div>
                {match.status !== "upcoming" && (
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
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">{match.game}</h2>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {match.mode} · {match.teamSize === 1 ? "Solo" : match.teamSize === 2 ? "Duo" : match.teamSize === 4 ? "Squad" : `${match.teamSize}v${match.teamSize}`}
                  {(match as any).map ? ` · ${(match as any).map}` : ""}
                </p>
              </div>
              {match.status !== "upcoming" && (
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
              )}
            </div>
          </div>
        )}

        {/* Code strip */}
        <div className="px-4 py-2.5 border-t border-card-border flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="font-mono text-accent text-sm font-bold">{match.code}</span>
          </div>
          <span className="text-muted-foreground text-xs">Match Code</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {match.filledSlots}/{match.slots}
            </span>
            <span className="flex items-center gap-1">
              <GoldCoinIcon size="sm" />{match.entryFee}
            </span>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div className="flex bg-card border border-card-border rounded-2xl p-1 mb-3 gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-semibold transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  "text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                  isActive ? "bg-white/20 text-white" : "bg-primary/15 text-primary"
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ── */}

      {/* INFO TAB */}
      {activeTab === "info" && (
        <div className="space-y-3 pb-4">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border border-card-border rounded-2xl p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Entry Fee</div>
              <div className="font-bold text-primary text-sm flex items-center justify-center gap-0.5">
                <GoldCoinIcon size="sm" />{match.entryFee}
              </div>
              {match.teamSize > 1 && <div className="text-[10px] text-muted-foreground mt-0.5">per player</div>}
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

          {/* Prize Pool */}
          <LivePrizePool match={match as any} />

          {/* Schedule & Host */}
          <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Schedule & Host</p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Start Time</p>
                <p className="text-sm font-semibold">{formatTime(match.startTime)}</p>
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
            {/* Slot progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>{match.filledSlots} joined</span>
                <span>{match.slots} total</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", slotsLeft === 0 ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${Math.min((match.filledSlots / match.slots) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Description */}
          {(match as any).description && (
            <div className="bg-card border border-card-border rounded-2xl px-4 py-3">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{(match as any).description}</p>
            </div>
          )}

          {/* Stream link */}
          {(match as any).streamLink && (
            <a
              href={(match as any).streamLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3 hover:bg-red-500/15 transition-colors"
            >
              <Tv2 className="w-4 h-4 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-400">Live Stream Available</p>
                <p className="text-[11px] text-muted-foreground truncate">{(match as any).streamLink}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </a>
          )}

          {/* Rules */}
          {Array.isArray((match as any).customRules) && (match as any).customRules.length > 0 && (
            <div className="bg-card border border-card-border rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-3">
                <ListChecks className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs font-bold text-primary uppercase tracking-wide">Match Rules</p>
              </div>
              <div className="space-y-2">
                {(match as any).customRules.map((rule: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                    <span className="text-sm text-foreground leading-snug">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tournament bracket (if applicable) */}
          {(match as any).isTournament && (
            <div className="bg-card border border-card-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-semibold">Tournament Bracket</p>
              </div>
              <TournamentBracket matchId={matchId} canManage={canManage} />
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            {/* Player join / notify */}
            {!match.isJoined && match.status === "upcoming" && user?.role === "player" && slotsLeft === 0 && (
              <NotifyMeButton matchId={matchId} />
            )}
            {!match.isJoined && match.status === "upcoming" && user?.role === "player" && slotsLeft > 0 && (
              <Dialog open={joinOpen} onOpenChange={(o) => { setJoinOpen(o); if (!o) { setSelectedSquadIds(new Set()); setTeamName(""); setJoinPlayers([]); setSoloSquadId(null); setSoloManual({ ign: "", uid: "" }); } }}>
                <DialogTrigger asChild>
                  <Button className="w-full" size="lg">
                    Join Match · <GoldCoin amount={match.teamSize > 1 ? (Number(match.entryFee) || 0) * match.teamSize : match.entryFee} size="sm" />
                    {match.teamSize > 1 && <span className="opacity-70 text-xs ml-1">({match.entryFee} × {match.teamSize})</span>}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Join Match</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    {match.teamSize === 1 ? (
                      <div className="space-y-3">
                        {(squad ?? []).length > 0 && (
                          <>
                            <Label>Pick from My Squad</Label>
                            <div className="space-y-1.5">
                              {(squad ?? []).map((m) => {
                                const isSelected = soloSquadId === m.id;
                                return (
                                  <button key={m.id}
                                    className={cn("w-full flex items-center justify-between text-sm rounded-lg px-3 py-2.5 transition-colors border", isSelected ? "bg-primary/20 border-primary/50" : "bg-secondary/50 border-transparent hover:bg-secondary")}
                                    onClick={() => { setSoloSquadId(isSelected ? null : m.id!); setSoloManual({ ign: "", uid: "" }); }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0", isSelected ? "bg-primary border-primary" : "border-muted-foreground")}>
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
                            <Input placeholder="IGN" value={soloManual.ign} disabled={soloSquadId !== null} onChange={(e) => { setSoloManual(f => ({ ...f, ign: e.target.value })); setSoloSquadId(null); }} />
                            <Input placeholder="UID" value={soloManual.uid} disabled={soloSquadId !== null} onChange={(e) => { setSoloManual(f => ({ ...f, uid: e.target.value })); setSoloSquadId(null); }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label>Team Name (optional)</Label>
                          <Input placeholder="Your team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Select {match.teamSize === 2 ? "Duo" : "Squad"} Players</Label>
                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                              selectedSquadIds.size + joinPlayers.filter(p => p.ign && p.uid).length === match.teamSize
                                ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground"
                            )}>
                              {selectedSquadIds.size + joinPlayers.filter(p => p.ign && p.uid).length}/{match.teamSize}
                            </span>
                          </div>
                          {(squad ?? []).length > 0 && (
                            <div className="space-y-1.5">
                              {(squad ?? []).map((m) => {
                                const isSelected = selectedSquadIds.has(m.id!);
                                return (
                                  <button key={m.id}
                                    className={cn("w-full flex items-center justify-between text-sm rounded-lg px-3 py-2.5 transition-colors border", isSelected ? "bg-primary/20 border-primary/50" : "bg-secondary/50 border-transparent hover:bg-secondary")}
                                    onClick={() => setSelectedSquadIds(prev => { const next = new Set(prev); if (next.has(m.id!)) next.delete(m.id!); else if (next.size < match.teamSize) next.add(m.id!); return next; })}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0", isSelected ? "bg-primary border-primary" : "border-muted-foreground")}>
                                        {isSelected && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-primary-foreground fill-current"><path d="M1 5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>}
                                      </div>
                                      <span className="font-medium">{m.name}</span>
                                    </div>
                                    <span className="text-muted-foreground text-xs font-mono">{m.uid}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
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
                                    <Input placeholder={`Player ${i + 1} IGN`}
                                      value={joinPlayers[i]?.ign ?? ""}
                                      onChange={(e) => setJoinPlayers(prev => { const next = [...prev]; next[i] = { ...next[i], ign: e.target.value, uid: next[i]?.uid ?? "" }; return next; })}
                                    />
                                    <Input placeholder="UID"
                                      value={joinPlayers[i]?.uid ?? ""}
                                      onChange={(e) => setJoinPlayers(prev => { const next = [...prev]; next[i] = { ...next[i], uid: e.target.value, ign: next[i]?.ign ?? "" }; return next; })}
                                    />
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    )}
                    <Button className="w-full" onClick={handleJoin} disabled={isJoining}>
                      {isJoining ? "Joining..." : `Confirm & Pay ${match.teamSize > 1 ? `${(Number(match.entryFee) || 0) * match.teamSize}` : match.entryFee} coins`}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* Host controls */}
            {canManage && match.status === "upcoming" && (
              <div className="space-y-2">
                <Button className="w-full" onClick={handleGoLive} disabled={isGoingLive} variant="default">
                  {isGoingLive ? "Starting..." : "Start Match (Go Live)"}
                </Button>
                <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full" onClick={() => setRoomCreds({ roomId: match.roomId ?? "", roomPassword: match.roomPassword ?? "" })}>
                      Update Room Credentials
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Set Room Credentials</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Room ID</Label>
                        <Input placeholder="Room ID" value={roomCreds.roomId} onChange={(e) => setRoomCreds(f => ({ ...f, roomId: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Room Password</Label>
                        <Input placeholder="Password" value={roomCreds.roomPassword} onChange={(e) => setRoomCreds(f => ({ ...f, roomPassword: e.target.value }))} />
                      </div>
                      <Button className="w-full" onClick={handleUpdateRoom} disabled={isUpdatingRoom}>
                        {isUpdatingRoom ? "Saving..." : "Save Credentials"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="destructive" className="w-full gap-2" onClick={handleDelete} disabled={isDeleting}>
                  <Trash2 className="w-4 h-4" /> {isDeleting ? "Deleting..." : "Delete Match"}
                </Button>
              </div>
            )}

            {canManage && match.status === "live" && (
              <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full" onClick={() => setRoomCreds({ roomId: match.roomId ?? "", roomPassword: match.roomPassword ?? "" })}>
                    Update Room Credentials
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Set Room Credentials</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Room ID</Label>
                      <Input placeholder="Room ID" value={roomCreds.roomId} onChange={(e) => setRoomCreds(f => ({ ...f, roomId: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Room Password</Label>
                      <Input placeholder="Password" value={roomCreds.roomPassword} onChange={(e) => setRoomCreds(f => ({ ...f, roomPassword: e.target.value }))} />
                    </div>
                    <Button className="w-full" onClick={handleUpdateRoom} disabled={isUpdatingRoom}>
                      {isUpdatingRoom ? "Saving..." : "Save Credentials"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}

      {/* CHAT & CREDS TAB */}
      {activeTab === "chat" && (
        <div className="space-y-3 pb-4">
          {/* Room Credentials */}
          {credsReleased ? (
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 bg-purple-500/5 border-b border-card-border">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-purple-400">Room Credentials</p>
                  <p className="text-[11px] text-muted-foreground">Use these to join the match room</p>
                </div>
              </div>
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Room ID</div>
                    <div className="font-mono font-bold text-lg">{match.roomId}</div>
                  </div>
                  <CopyButton value={match.roomId ?? ""} />
                </div>
                <div className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Password</div>
                    <div className="font-mono font-bold text-lg">{match.roomPassword}</div>
                  </div>
                  <CopyButton value={match.roomPassword ?? ""} />
                </div>
              </div>
              <MatchCountdown startTime={match.startTime} status={match.status} />
            </div>
          ) : match.isJoined ? (
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden flex flex-col items-center gap-2 text-center">
              <div className="p-4 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-semibold text-sm">Credentials Not Yet Released</p>
                <p className="text-xs text-muted-foreground">The host will share the Room ID & Password before the match starts.</p>
              </div>
              <MatchCountdown startTime={match.startTime} status={match.status} />
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden flex flex-col items-center gap-2 text-center">
              <div className="p-4 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-semibold text-sm">Join to See Credentials</p>
                <p className="text-xs text-muted-foreground">Room ID and Password are only visible to registered participants.</p>
              </div>
              <MatchCountdown startTime={match.startTime} status={match.status} />
            </div>
          )}

          {/* Group Chat */}
          {canChat ? (
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden flex flex-col" style={{ height: "420px" }}>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-card-border bg-violet-500/5 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-violet-400">Match Group Chat</p>
                  <p className="text-[11px] text-muted-foreground">Chat with players in this match</p>
                </div>
              </div>
              <MatchGroupChat groupId={(match as any).groupId} currentUser={user!} />
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-2xl p-6 flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-semibold text-sm">Join to Chat</p>
              <p className="text-xs text-muted-foreground">The group chat is only available to registered participants.</p>
            </div>
          )}
        </div>
      )}

      {/* PLAYERS TAB */}
      {activeTab === "leaderboard" && (() => {
        const sorted = [...(players ?? [])].sort((a: any, b: any) => {
          const ra = a.rank ?? 9999;
          const rb = b.rank ?? 9999;
          if (ra !== rb) return ra - rb;
          return (b.kills ?? -1) - (a.kills ?? -1);
        });
        const hasAnyData = (players ?? []).some((p: any) => p.rank != null || p.kills != null);

        const handleSaveLB = async () => {
          if (!players) return;
          setIsSavingLB(true);
          const entries = (players as any[]).map((p: any) => ({
            participantId: p.id,
            kills: lbEdits[p.id]?.kills !== undefined ? (parseInt(lbEdits[p.id].kills) || 0) : (p.kills ?? 0),
            rank: lbEdits[p.id]?.rank !== undefined ? (parseInt(lbEdits[p.id].rank) || null) : (p.rank ?? null),
          }));
          try {
            const res = await customFetch(`/api/matches/${matchId}/leaderboard`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entries }),
            });
            if (!res.ok) throw new Error();
            toast({ title: "Leaderboard updated!" });
            setLbEdits({});
            queryClient.invalidateQueries({ queryKey: ["getMatchPlayers", matchId] });
          } catch {
            toast({ title: "Failed to save leaderboard", variant: "destructive" });
          } finally {
            setIsSavingLB(false);
          }
        };

        const rankMedal = (rank: number | null | undefined) => {
          if (rank === 1) return "🥇";
          if (rank === 2) return "🥈";
          if (rank === 3) return "🥉";
          return null;
        };

        return (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-sm">Live Leaderboard</span>
                {match.status === "live" && (
                  <span className="text-[10px] font-bold text-red-400 border border-red-400/40 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                    LIVE
                  </span>
                )}
              </div>
              {canManage && match.status !== "upcoming" && (
                <Button size="sm" onClick={handleSaveLB} disabled={isSavingLB} className="h-7 text-xs px-3">
                  {isSavingLB ? "Saving…" : "Save"}
                </Button>
              )}
            </div>

            {/* Empty state */}
            {(!players || players.length === 0) ? (
              <div className="bg-card border border-card-border rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-2xl">🏆</div>
                <p className="font-semibold text-sm mt-1">No participants yet</p>
                <p className="text-xs text-muted-foreground">Players who join will appear here.</p>
              </div>
            ) : match.status === "upcoming" && !hasAnyData ? (
              <div className="bg-card border border-card-border rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-2xl">🏆</div>
                <p className="font-semibold text-sm mt-1">Leaderboard not started</p>
                <p className="text-xs text-muted-foreground">Rankings will appear once the match goes live.</p>
              </div>
            ) : (
              <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
                {/* Host edit header */}
                {canManage && match.status === "live" && (
                  <div className="px-4 py-2.5 bg-primary/5 border-b border-card-border">
                    <p className="text-[11px] text-primary font-medium">Edit kills & rank for each team, then tap Save.</p>
                  </div>
                )}
                <div className="divide-y divide-card-border">
                  {sorted.map((p: any, i: number) => {
                    const currentKills = lbEdits[p.id]?.kills !== undefined ? lbEdits[p.id].kills : String(p.kills ?? "");
                    const currentRank = lbEdits[p.id]?.rank !== undefined ? lbEdits[p.id].rank : String(p.rank ?? "");
                    const displayRank = p.rank ?? null;
                    const medal = rankMedal(displayRank);
                    const igns = (p.players ?? []).map((pl: any) => pl.ign).filter(Boolean);

                    return (
                      <div key={p.id} className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        i === 0 && p.rank === 1 ? "bg-amber-500/5" : ""
                      )}>
                        {/* Rank badge */}
                        <div className="w-8 shrink-0 flex flex-col items-center">
                          {medal ? (
                            <span className="text-xl leading-none">{medal}</span>
                          ) : (
                            <span className={cn(
                              "text-xs font-bold font-mono",
                              displayRank ? "text-muted-foreground" : "text-muted-foreground/40"
                            )}>
                              {displayRank ? `#${displayRank}` : `—`}
                            </span>
                          )}
                        </div>

                        {/* Team info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {p.teamName || (match.teamSize > 1 ? `Team ${p.teamNumber}` : igns[0] || `Player ${p.teamNumber}`)}
                          </p>
                          {igns.length > 0 && (
                            <p className="text-[11px] text-muted-foreground truncate">{igns.join(", ")}</p>
                          )}
                        </div>

                        {/* Host editable fields */}
                        {canManage && match.status === "live" ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[9px] text-muted-foreground font-medium uppercase">Kills</span>
                              <Input
                                type="number"
                                min={0}
                                value={currentKills}
                                onChange={e => setLbEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], kills: e.target.value } }))}
                                className="w-14 h-7 text-center text-xs px-1 font-mono"
                              />
                            </div>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[9px] text-muted-foreground font-medium uppercase">Rank</span>
                              <Input
                                type="number"
                                min={1}
                                value={currentRank}
                                onChange={e => setLbEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], rank: e.target.value } }))}
                                className="w-14 h-7 text-center text-xs px-1 font-mono"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 shrink-0">
                            {p.kills != null && (
                              <div className="flex flex-col items-center">
                                <span className="text-sm font-bold text-foreground">{p.kills}</span>
                                <span className="text-[10px] text-muted-foreground">kills</span>
                              </div>
                            )}
                            {p.reward != null && parseFloat(p.reward) > 0 && (
                              <div className="flex flex-col items-center">
                                <span className="text-sm font-bold text-amber-400">₹{parseFloat(p.reward).toFixed(0)}</span>
                                <span className="text-[10px] text-muted-foreground">won</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === "players" && (
        <div className="space-y-3 pb-4">
          {user?.role === "player" && match.isJoined && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">
                <span className="font-semibold">Slot Warning:</span> Slots are fixed as shown. If you join another player's or team's slot, you will be removed from the match.
              </p>
            </div>
          )}
          {(!players || players.length === 0) ? (
            <div className="bg-card border border-card-border rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-semibold text-sm mt-1">No players yet</p>
              <p className="text-xs text-muted-foreground">Be the first to join this match!</p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Participants</span>
                </div>
                <span className="text-xs text-muted-foreground">{match.filledSlots}/{match.slots} slots</span>
              </div>
              <div className="divide-y divide-card-border">
                {players.map((p: any, i: number) => {
                  const teamPlayers = Array.isArray(p.players) ? p.players : [];
                  const firstPlayer = teamPlayers[0];
                  const playerAvatar = p.userAvatar;
                  const playerName = p.userName;
                  const playerHandle = p.userHandle;
                  const isTeamMatch = match.teamSize > 1;
                  const displayName = isTeamMatch
                    ? (p.teamName || `Team ${p.teamNumber ?? i + 1}`)
                    : (playerName || playerHandle || "—");
                  return (
                  <div key={p.id ?? i} className="flex items-center gap-3 px-4 py-3">
                    {/* Rank number */}
                    <div className="w-6 text-xs text-muted-foreground text-center font-mono shrink-0">{i + 1}</div>
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 overflow-hidden text-base">
                      {playerAvatar && (playerAvatar.startsWith("/") || playerAvatar.startsWith("http"))
                        ? <img src={playerAvatar.startsWith("/objects/") ? `/api/storage${playerAvatar}` : playerAvatar} alt="" className="w-full h-full object-cover" />
                        : (playerAvatar || "🔥")}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{displayName}</p>
                      </div>
                      {isTeamMatch && (playerName || playerHandle) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Captain: <span className="text-foreground font-medium">{playerName || `@${playerHandle}`}</span>
                          {canManage && playerHandle && <span className="text-violet-400 font-medium ml-1">@{playerHandle}</span>}
                        </div>
                      )}
                      {teamPlayers.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {teamPlayers.map((pl: any, teammateIndex: number) => (
                            <div key={`${p.id ?? i}-${teammateIndex}`} className="flex items-center gap-2 flex-wrap text-[11px]">
                              {isTeamMatch && (
                                <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {teammateIndex + 1}
                                </span>
                              )}
                              {pl.ign && (
                                <span className="text-muted-foreground">
                                  IGN: <span className="text-foreground font-medium">{pl.ign}</span>
                                </span>
                              )}
                              {pl.uid && (
                                <span className="text-muted-foreground font-mono">
                                  UID: <span className="text-foreground">{pl.uid}</span>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!isTeamMatch && canManage && playerHandle && (
                        <div className="mt-0.5">
                          <span className="text-[11px] text-violet-400 font-medium">@{playerHandle}</span>
                        </div>
                      )}
                      {isTeamMatch && teamPlayers.length === 0 && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          No teammates listed
                        </div>
                      )}
                      {!isTeamMatch && p.teamName && (
                        <div className="mt-0.5">
                          <span className="text-[11px] text-primary/80 font-semibold">[{p.teamName}]</span>
                        </div>
                        )}
                    </div>
                    {/* Rank result if completed */}
                    {match.status === "completed" && p.rank != null && (
                      <div className="shrink-0 text-right">
                        <div className={cn("text-xs font-bold", p.rank === 1 ? "text-yellow-400" : p.rank <= 3 ? "text-amber-400" : "text-muted-foreground")}>
                          #{p.rank}
                        </div>
                        {p.kills != null && <div className="text-[10px] text-muted-foreground">{p.kills}K</div>}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
