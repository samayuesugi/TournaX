import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Clock, Users, Trophy, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoldCoinIcon } from "@/components/ui/Coins";
import type { Match } from "@workspace/api-client-react";

interface MatchCardProps {
  match: Match;
  className?: string;
}

const statusColors = {
  upcoming: "bg-primary/20 text-primary border-primary/30",
  live: "bg-red-500/10 text-red-400 border-red-500/20",
  completed: "bg-muted text-muted-foreground border-border",
};

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      LIVE
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

function useCountdown(targetIso: string) {
  const getRemaining = () => {
    const diff = new Date(targetIso).getTime() - Date.now();
    return diff;
  };
  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return remaining;
}

function Countdown({ startTimeIso, large }: { startTimeIso: string; large?: boolean }) {
  const ms = useCountdown(startTimeIso);

  if (ms <= 0) {
    return large ? (
      <span className="text-primary font-bold tabular-nums">Starting soon</span>
    ) : (
      <span className="text-primary text-xs font-semibold">Starting soon</span>
    );
  }

  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hrs = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (large) {
    const pad = (n: number) => String(n).padStart(2, "0");
    if (days > 0) {
      return (
        <div className="flex items-center gap-1 tabular-nums">
          <span className="text-violet-300 font-bold text-base">{days}d</span>
          <span className="text-primary/60 text-xs">:</span>
          <span className="text-violet-300 font-bold text-base">{pad(hrs)}h</span>
          <span className="text-primary/60 text-xs">:</span>
          <span className="text-violet-300 font-bold text-base">{pad(mins)}m</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-0.5 tabular-nums">
        {hrs > 0 && (
          <>
            <span className="text-violet-300 font-bold text-lg leading-none">{pad(hrs)}</span>
            <span className="text-primary/60 text-xs mx-0.5">:</span>
          </>
        )}
        <span className="text-violet-300 font-bold text-lg leading-none">{pad(mins)}</span>
        <span className="text-primary/60 text-xs mx-0.5">:</span>
        <span className={cn("font-bold text-lg leading-none tabular-nums", secs < 60 && mins === 0 && hrs === 0 ? "text-red-400" : "text-violet-300")}>{pad(secs)}</span>
      </div>
    );
  }

  let label: string;
  if (days > 0) {
    label = `${days}d ${hrs}h`;
  } else if (hrs > 0) {
    label = `${hrs}h ${mins}m`;
  } else if (mins > 0) {
    label = `${mins}m ${secs}s`;
  } else {
    label = `${secs}s`;
  }

  return (
    <span className="text-primary text-xs font-semibold tabular-nums">
      {label}
    </span>
  );
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const stars = Math.round(rating * 2) / 2;
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={cn(
              "w-3 h-3",
              s <= Math.floor(stars) ? "fill-amber-400 text-amber-400" :
              s - 0.5 === stars ? "fill-amber-400/50 text-amber-400" :
              "fill-none text-muted-foreground/40"
            )}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-amber-400">{rating.toFixed(1)}</span>
      <span className="text-[10px] text-muted-foreground">({count})</span>
    </div>
  );
}

export function MatchCard({ match, className }: MatchCardProps) {
  const slotsLeft = match.slots - match.filledSlots;
  const showcase = (match as any).showcasePrizePool ?? 0;
  const thumbnail = (match as any).thumbnailImage;
  const hostRating: number | null = (match as any).hostRating ?? null;
  const hostReviewCount: number = (match as any).hostReviewCount ?? 0;
  const hostAvatar: string = (match as any).hostAvatar ?? "🛡️";
  const hostHandle: string = (match as any).hostHandle ?? "";
  const matchMap: string | null = (match as any).map ?? null;
  const teamSizeLabel = match.teamSize === 1 ? "Solo" : match.teamSize === 2 ? "Duo" : match.teamSize === 4 ? "Squad" : `${match.teamSize}v${match.teamSize}`;

  const isEsportsOnly = (match as any).isEsportsOnly ?? false;
  const isUpcoming = match.status === "upcoming";

  const statusBadge = isUpcoming ? (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1", statusColors.upcoming)}>
      <Clock className="w-2.5 h-2.5" />
      <Countdown startTimeIso={match.startTime} />
    </span>
  ) : (
    <span className={cn("text-xs font-bold px-2.5 py-0.5 rounded-full border shrink-0 flex items-center", statusColors[match.status])}>
      {match.status === "live" ? <LiveBadge /> : "Completed"}
    </span>
  );

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
              className="w-full h-full object-cover [object-position:center_20%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
            {isEsportsOnly && (
              <span className="esports-badge absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                ⚡ ESPORTS
              </span>
            )}
            <span className={cn("absolute top-2 right-2 text-xs font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-sm flex items-center gap-1", statusColors[match.status])}>
              {isUpcoming ? (
                <>
                  <Clock className="w-2.5 h-2.5" />
                  <Countdown startTimeIso={match.startTime} />
                </>
              ) : match.status === "live" ? <LiveBadge /> : "Completed"}
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
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-xs font-medium text-primary/80">{teamSizeLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono text-accent">#{match.code}</span>
                {matchMap && (
                  <>
                    <span>·</span>
                    <span>🗺️ {matchMap}</span>
                  </>
                )}
              </div>
            </div>
            {!thumbnail && (
              <div className="flex items-center gap-1.5 shrink-0">
                {isEsportsOnly && (
                  <span className="esports-badge text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    ⚡ ESPORTS
                  </span>
                )}
                {statusBadge}
              </div>
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
              <div className={cn("font-bold text-sm", slotsLeft === 0 ? "text-destructive" : "text-primary")}>
                {match.filledSlots}/{match.slots}
              </div>
            </div>
          </div>

          {isUpcoming && (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs text-primary/70 font-medium">Starts in</span>
              </div>
              <Countdown startTimeIso={match.startTime} large />
            </div>
          )}

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

          <div className="flex items-center gap-1.5 pt-2.5 mt-2.5 border-t border-border/50 min-w-0">
            <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs shrink-0 overflow-hidden">
              {hostAvatar && (hostAvatar.startsWith("/") || hostAvatar.startsWith("http"))
                ? <img src={hostAvatar} alt="" className="w-full h-full object-cover" />
                : hostAvatar}
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {hostHandle ? `@${hostHandle}` : "Host"}
            </span>
            {hostRating !== null && hostReviewCount > 0 && (
              <>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <StarRating rating={hostRating} count={hostReviewCount} />
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
