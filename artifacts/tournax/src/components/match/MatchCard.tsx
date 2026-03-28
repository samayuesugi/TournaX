import { Link } from "wouter";
import { Clock, Users, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoldCoinIcon } from "@/components/ui/Coins";
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
  const showcase = (match as any).showcasePrizePool ?? 0;
  const thumbnail = (match as any).thumbnailImage;

  return (
    <Link href={`/matches/${match.id}`}>
      <div
        className={cn(
          "bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/40 hover:bg-card/80 transition-all cursor-pointer active:scale-[0.99]",
          className
        )}
      >
        {thumbnail && (
          <div className="relative w-full h-32 overflow-hidden">
            <img
              src={thumbnail}
              alt="Match thumbnail"
              className="w-full h-full object-cover object-bottom"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
            <span className={cn("absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full border backdrop-blur-sm", statusColors[match.status])}>
              {statusLabels[match.status]}
            </span>
          </div>
        )}
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
            {!thumbnail && (
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border shrink-0", statusColors[match.status])}>
                {statusLabels[match.status]}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Entry</div>
              <div className="font-bold text-sm text-primary flex items-center justify-center gap-0.5">
                <GoldCoinIcon size="sm" />
                {match.entryFee}
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Trophy className="w-3 h-3 text-amber-400" />
                <span className="text-xs text-amber-400/80">Prize</span>
              </div>
              <div className="font-bold text-sm text-amber-300 flex items-center justify-center gap-0.5">
                <GoldCoinIcon size="sm" />
                {showcase}
              </div>
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

          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1 min-w-0">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">{formatTime(match.startTime)}</span>
            </div>
            {match.isJoined && (
              <span className="text-xs font-medium text-green-400 shrink-0">✓ Joined</span>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" />
                <span className={cn("font-semibold", slotsLeft === 0 ? "text-destructive" : "text-foreground")}>
                  {match.filledSlots}
                </span>
                <span>/ {match.slots} joined</span>
              </span>
              {slotsLeft > 0 && (
                <span className="text-muted-foreground">{slotsLeft} slots left</span>
              )}
              {slotsLeft === 0 && (
                <span className="text-destructive font-medium">Full</span>
              )}
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  slotsLeft === 0 ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${Math.min((match.filledSlots / match.slots) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
