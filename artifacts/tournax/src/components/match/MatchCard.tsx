import { Link } from "wouter";
import { Clock, Users, Trophy, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "@workspace/api-client-react";

interface MatchCardProps {
  match: Match;
  className?: string;
}

const statusConfig = {
  upcoming: { label: "Upcoming", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  live: { label: "🔴 Live", cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  completed: { label: "Completed", cls: "bg-muted text-muted-foreground border-border" },
};

const gameColors: Record<string, string> = {
  "BGMI": "from-orange-500/20 to-orange-900/10",
  "Free Fire": "from-yellow-500/20 to-yellow-900/10",
  "COD Mobile": "from-green-500/20 to-green-900/10",
  "Valorant": "from-red-500/20 to-red-900/10",
  "PUBG PC": "from-amber-500/20 to-amber-900/10",
};

const gameAccents: Record<string, string> = {
  "BGMI": "border-orange-500/30",
  "Free Fire": "border-yellow-500/30",
  "COD Mobile": "border-green-500/30",
  "Valorant": "border-red-500/30",
  "PUBG PC": "border-amber-500/30",
};

const gameEmojis: Record<string, string> = {
  "BGMI": "🔫",
  "Free Fire": "🔥",
  "COD Mobile": "💣",
  "Valorant": "🎯",
  "PUBG PC": "🪖",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

export function MatchCard({ match, className }: MatchCardProps) {
  const slotsLeft = match.slots - match.filledSlots;
  const showcase = (match as any).showcasePrizePool ?? 0;
  const fillPercent = Math.min((match.filledSlots / match.slots) * 100, 100);
  const gradient = gameColors[match.game] ?? "from-primary/20 to-primary/5";
  const accentBorder = gameAccents[match.game] ?? "border-primary/30";
  const emoji = gameEmojis[match.game] ?? "🎮";
  const status = statusConfig[match.status];

  return (
    <Link href={`/matches/${match.id}`}>
      <div className={cn(
        "rounded-2xl overflow-hidden border transition-all cursor-pointer active:scale-[0.99] hover:shadow-lg hover:shadow-black/20",
        accentBorder,
        "bg-card hover:border-opacity-60",
        className
      )}>
        {/* Game header banner */}
        <div className={cn("bg-gradient-to-r px-4 pt-3.5 pb-3 flex items-center justify-between", gradient)}>
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none">{emoji}</span>
            <div>
              <div className="font-bold text-sm text-foreground leading-tight">{match.game}</div>
              <div className="text-xs text-muted-foreground">{match.mode} · {match.teamSize}v{match.teamSize}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", status.cls)}>
              {status.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">#{match.code}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
          <div className="px-3 py-2.5 text-center">
            <div className="text-[10px] text-muted-foreground mb-0.5">Entry</div>
            <div className="font-bold text-sm text-primary">₹{match.entryFee}</div>
          </div>
          <div className="px-3 py-2.5 text-center bg-amber-500/5">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Trophy className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-[10px] text-amber-400/80">Prize</span>
            </div>
            <div className="font-bold text-sm text-amber-300">₹{showcase}</div>
          </div>
          <div className="px-3 py-2.5 text-center">
            <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-0.5">
              <Users className="w-2.5 h-2.5" /> Slots
            </div>
            <div className={cn("font-bold text-sm", slotsLeft === 0 ? "text-destructive" : "text-foreground")}>
              {slotsLeft === 0 ? "Full" : `${slotsLeft}/${match.slots}`}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{formatTime(match.startTime)}</span>
            </div>
            <div className="flex items-center gap-2">
              {match.isJoined && (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                  <Zap className="w-3 h-3" /> Joined
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {match.filledSlots}/{match.slots} joined
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                slotsLeft === 0 ? "bg-destructive" : fillPercent >= 75 ? "bg-amber-400" : "bg-primary"
              )}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
