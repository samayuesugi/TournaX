import { Link } from "wouter";
import { Clock, Users, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "@workspace/api-client-react";

interface MatchCardProps {
  match: Match;
  className?: string;
}

const statusColors = {
  upcoming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  live: "bg-green-500/20 text-green-400 border-green-500/30",
  completed: "bg-muted text-muted-foreground border-border",
};

const statusLabels = {
  upcoming: "Upcoming",
  live: "🔴 Live",
  completed: "Completed",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

export function MatchCard({ match, className }: MatchCardProps) {
  const slotsLeft = match.slots - match.filledSlots;
  const fillPercent = (match.filledSlots / match.slots) * 100;
  const showcase = (match as any).showcasePrizePool ?? 0;

  return (
    <Link href={`/matches/${match.id}`}>
      <div
        className={cn(
          "bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/40 hover:bg-card/80 transition-all cursor-pointer active:scale-[0.99]",
          className
        )}
      >
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">Prize Pool</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-amber-300">₹{showcase}</span>
            <span className="text-[10px] text-amber-500/70 font-medium uppercase tracking-wide">Showcase</span>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm text-foreground truncate">{match.game}</span>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-muted-foreground text-xs">{match.mode}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono text-accent">#{match.code}</span>
                <span>·</span>
                <span>{match.teamSize}v{match.teamSize}</span>
              </div>
            </div>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", statusColors[match.status])}>
              {statusLabels[match.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Entry</div>
              <div className="font-bold text-sm text-primary">₹{match.entryFee}</div>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <Users className="w-3 h-3" /> Slots
              </div>
              <div className={cn("font-bold text-sm", slotsLeft === 0 ? "text-destructive" : "text-foreground")}>
                {slotsLeft}/{match.slots}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1 min-w-0">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">{formatTime(match.startTime)}</span>
            </div>
            {match.isJoined && (
              <span className="text-xs font-medium text-green-400 shrink-0">✓ Joined</span>
            )}
          </div>

          <div className="mt-2.5">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  fillPercent >= 90 ? "bg-destructive" : fillPercent >= 70 ? "bg-amber-500" : "bg-primary"
                )}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
