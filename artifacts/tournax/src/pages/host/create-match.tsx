import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateMatch, useGetWallet } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Gift, ImageIcon, Map, Wallet, Lock, Info, Trophy, Medal, Award, Shield, Settings as SettingsIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

import thumb1 from "@assets/e481c7200956291.666b40011da84_1774695040111.webp";
import thumb2 from "@assets/81e162153377959.632e6c70effcb_1774695040183.jpg";
import thumb3 from "@assets/a8f058153377959.632e6c70f10b6_1774695040228.jpg";
import thumb4 from "@assets/6fa5cd183933069.6549000c19789_1774695040280.png";

const THUMBNAIL_OPTIONS = [
  { id: "thumb1", src: thumb1, label: "Warrior" },
  { id: "thumb2", src: thumb2, label: "Rivals" },
  { id: "thumb3", src: thumb3, label: "Squad" },
  { id: "thumb4", src: thumb4, label: "Battle" },
];

const FF_CATEGORIES = [
  { id: "Battle Royale", label: "Battle Royale", emoji: "🔫", allowSquad: true },
  { id: "Clash Squad", label: "Clash Squad", emoji: "⚔️", allowSquad: true },
  { id: "Lone Wolf", label: "Lone Wolf", emoji: "🐺", allowSquad: false },
];

const FF_MAPS = ["Bermuda", "Kalahari", "Purgatory", "Alps", "Nextera", "Aden", "Bermuda Remastered"];

const BGMI_CATEGORIES = [
  { id: "Classic", label: "Classic", emoji: "🏆", allowSquad: true },
  { id: "TDM", label: "TDM", emoji: "⚡", allowSquad: true },
];

const BGMI_MAPS = ["Erangel", "Miramar", "Sanhok", "Vikendi", "Livik", "Karakin", "Nusa"];

const ESPORTS_CATEGORY = { id: "Esports", label: "Esports", emoji: "🏅", allowSquad: true };

const TEAM_SIZES = [
  { label: "Solo", value: 1 },
  { label: "Duo", value: 2 },
  { label: "Squad", value: 4 },
];

type RewardRow = { id: string; label: string; pct: number; locked: boolean };

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getDefaultRewardRows(categoryId: string, numSlots: number = 4): { rows: RewardRow[]; hostPct: number; platformPct: number; locked: boolean } {
  const isBR = categoryId === "Battle Royale" || categoryId === "Esports" || categoryId === "Classic";
  const n = Math.max(1, Math.min(numSlots || 4, 100));
  if (isBR) {
    const rows: RewardRow[] = Array.from({ length: n }, (_, i) => {
      const pos = i + 1;
      let pct = 0;
      if (pos === 1) pct = 30;
      else if (pos === 2) pct = 20;
      else if (pos === 3) pct = 10;
      return { id: String(pos), label: `${getOrdinal(pos)} Place`, pct, locked: false };
    });
    return { rows, hostPct: 10, platformPct: 10, locked: false };
  }
  return {
    rows: [{ id: "1", label: "Winner", pct: 90, locked: true }],
    hostPct: 5,
    platformPct: 5,
    locked: true,
  };
}

function RewardDistributionTable({
  categoryId,
  showcasePrize,
  distribution,
  onChange,
}: {
  categoryId: string;
  showcasePrize: number;
  distribution: { rows: RewardRow[]; hostPct: number; platformPct: number; locked: boolean };
  onChange: (d: { rows: RewardRow[]; hostPct: number; platformPct: number; locked: boolean }) => void;
}) {
  const { rows, hostPct, platformPct, locked } = distribution;
  const nonLockedTotal = rows.filter(r => !r.locked).reduce((s, r) => s + r.pct, 0);
  const lockedTotal = rows.filter(r => r.locked).reduce((s, r) => s + r.pct, 0);
  const winnerPoolPct = lockedTotal || nonLockedTotal;
  const targetNonLocked = 100 - hostPct - platformPct;
  const isValid = Math.abs(nonLockedTotal - targetNonLocked) < 0.1;

  const updateRowPct = (id: string, rawVal: string) => {
    const val = parseFloat(rawVal);
    if (isNaN(val) || val < 0) return;
    onChange({
      ...distribution,
      rows: rows.map(r => r.id === id ? { ...r, pct: val } : r),
    });
  };

  const updateRowCoins = (id: string, rawVal: string) => {
    if (!showcasePrize) return;
    const coins = parseFloat(rawVal);
    if (isNaN(coins) || coins < 0) return;
    const pct = (coins / showcasePrize) * 100;
    onChange({
      ...distribution,
      rows: rows.map(r => r.id === id ? { ...r, pct: Math.round(pct * 10) / 10 } : r),
    });
  };

  const isBR = !locked;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reward Distribution</p>
        {locked && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" /> Fixed
          </span>
        )}
      </div>

      {!locked && (
        <div className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <span>Enter % for each position. Host (10%) and Platform (10%) are fixed. Winners pool must total {targetNonLocked}%.</span>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_70px_80px] bg-secondary/60 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide px-3 py-2">
          <span>Position</span>
          <span className="text-center">%</span>
          <span className="text-center">Coins</span>
        </div>

        {rows.map((row, i) => {
          const coins = showcasePrize > 0 ? Math.round((row.pct / 100) * showcasePrize) : null;
          const pos = parseInt(row.id);
          return (
            <div
              key={row.id}
              className={cn(
                "grid grid-cols-[1fr_70px_80px] items-center px-3 py-2.5 gap-2",
                i !== 0 ? "border-t border-border/50" : "",
                row.locked ? "opacity-70" : ""
              )}
            >
              <div className="flex items-center gap-1.5">
                {pos === 1 ? (
                  <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                ) : pos === 2 ? (
                  <Medal className="w-4 h-4 text-slate-300 shrink-0" />
                ) : pos === 3 ? (
                  <Award className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <span className="w-4 h-4 text-[10px] font-bold text-muted-foreground flex items-center justify-center shrink-0 rounded-full bg-secondary/80">
                    {pos || "—"}
                  </span>
                )}
                <span className="text-xs font-medium leading-tight">{row.label}</span>
                {row.locked && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
              </div>

              <div className="text-center">
                {row.locked ? (
                  <span className="text-xs font-bold text-muted-foreground">{row.pct}%</span>
                ) : (
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={row.pct}
                      onChange={(e) => updateRowPct(row.id, e.target.value)}
                      className="h-7 text-xs text-center pr-4 pl-1"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                )}
              </div>

              <div className="text-center">
                {row.locked || !isBR ? (
                  <span className="text-xs font-semibold text-amber-400">
                    {coins != null ? <GoldCoin amount={coins} size="sm" /> : "—"}
                  </span>
                ) : (
                  <Input
                    type="number"
                    min={0}
                    placeholder={coins != null ? String(coins) : "0"}
                    className="h-7 text-xs text-center px-1"
                    onBlur={(e) => { if (e.target.value) updateRowCoins(row.id, e.target.value); }}
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </div>
            </div>
          );
        })}

        <div className="border-t border-border/50 bg-secondary/20">
          <div className="grid grid-cols-[1fr_70px_80px] items-center px-3 py-2.5 gap-2">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Host</span>
              <Lock className="w-3 h-3 text-muted-foreground" />
            </div>
            <div className="text-center">
              <span className="text-xs font-bold text-muted-foreground">{hostPct}%</span>
            </div>
            <div className="text-center">
              <span className="text-xs font-semibold text-muted-foreground">
                {showcasePrize > 0 ? <GoldCoin amount={Math.round((hostPct / 100) * showcasePrize)} size="sm" /> : "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_70px_80px] items-center px-3 py-2.5 gap-2 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <SettingsIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Platform</span>
              <Lock className="w-3 h-3 text-muted-foreground" />
            </div>
            <div className="text-center">
              <span className="text-xs font-bold text-muted-foreground">{platformPct}%</span>
            </div>
            <div className="text-center">
              <span className="text-xs font-semibold text-muted-foreground">
                {showcasePrize > 0 ? <GoldCoin amount={Math.round((platformPct / 100) * showcasePrize)} size="sm" /> : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isBR && !isValid && nonLockedTotal > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            Winner positions total {nonLockedTotal.toFixed(1)}% (should be {targetNonLocked}%).
            {nonLockedTotal < targetNonLocked ? ` Add ${(targetNonLocked - nonLockedTotal).toFixed(1)}% more.` : ` Remove ${(nonLockedTotal - targetNonLocked).toFixed(1)}%.`}
          </span>
        </div>
      )}

      {isBR && isValid && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          <Trophy className="w-3.5 h-3.5 shrink-0" />
          <span>Distribution is balanced! Total: 100%</span>
        </div>
      )}
    </div>
  );
}

export default function CreateMatchPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { mutateAsync: createMatch, isPending } = useCreateMatch();
  const { data: wallet } = useGetWallet();

  const hostGame = (user as any)?.game ?? "";
  const isFF = hostGame === "Free Fire";
  const isBGMI = hostGame === "BGMI";
  const baseCategories = isFF ? FF_CATEGORIES : isBGMI ? BGMI_CATEGORIES : [];
  const categories = [...baseCategories, ESPORTS_CATEGORY];
  const maps = isFF ? FF_MAPS : isBGMI ? BGMI_MAPS : [];
  const maxSlots = isFF ? 50 : 100;

  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id ?? "");
  const activeCat = categories.find(c => c.id === selectedCategory) ?? categories[0];
  const allowSquad = activeCat?.allowSquad ?? true;
  const availableTeamSizes = allowSquad ? TEAM_SIZES : TEAM_SIZES.filter(t => t.value !== 4);

  const [teamSize, setTeamSize] = useState<number>(1);
  const [selectedMap, setSelectedMap] = useState<string>("");
  const [selectedThumbnail, setSelectedThumbnail] = useState<string>("");
  const [form, setForm] = useState({
    entryFee: "",
    slots: "",
    startTime: "",
    hostContribution: "",
    description: "",
  });

  const [distribution, setDistribution] = useState(() => getDefaultRewardRows(categories[0]?.id ?? ""));

  useEffect(() => {
    if (!allowSquad && teamSize === 4) setTeamSize(1);
  }, [selectedCategory, allowSquad]);

  useEffect(() => {
    if (categories.length > 0) setSelectedCategory(categories[0].id);
  }, [hostGame]);

  const entryFeeNum = parseFloat(form.entryFee) || 0;
  const slotsNum = parseInt(form.slots) || 0;

  useEffect(() => {
    setDistribution(getDefaultRewardRows(selectedCategory, slotsNum || 4));
  }, [selectedCategory, slotsNum]);
  const contributionNum = parseFloat(form.hostContribution) || 0;
  const hostBalance = wallet?.balance ?? 0;
  const basePool = entryFeeNum * slotsNum;
  const showcasePrize = basePool + contributionNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !form.startTime || !form.entryFee || !form.slots) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    if (!selectedThumbnail) {
      toast({ title: "Select a match thumbnail", variant: "destructive" });
      return;
    }
    if (slotsNum > maxSlots) {
      toast({ title: `Max ${maxSlots} slots for ${hostGame}`, variant: "destructive" });
      return;
    }
    if (contributionNum > hostBalance) {
      toast({ title: "Insufficient wallet balance for contribution", variant: "destructive" });
      return;
    }

    if (!distribution.locked) {
      const nonLockedTotal = distribution.rows.filter(r => !r.locked).reduce((s, r) => s + r.pct, 0);
      const targetNonLocked = 100 - distribution.hostPct - distribution.platformPct;
      if (Math.abs(nonLockedTotal - targetNonLocked) > 1) {
        toast({ title: `Reward percentages must total ${targetNonLocked}% for winner positions`, variant: "destructive" });
        return;
      }
    }

    try {
      const match = await createMatch({
        data: {
          game: hostGame,
          mode: selectedCategory,
          category: selectedCategory,
          map: selectedMap || undefined,
          teamSize,
          entryFee: entryFeeNum,
          slots: slotsNum,
          startTime: new Date(form.startTime).toISOString(),
          showcasePrizePool: showcasePrize,
          hostContribution: contributionNum,
          description: form.description.trim() || undefined,
          thumbnailImage: selectedThumbnail || undefined,
          rewardDistribution: distribution,
        } as any,
      });
      toast({ title: "Match created!" });
      navigate(`/matches/${match.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create match", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  if (!hostGame) {
    return (
      <AppLayout showBack backHref="/host" title="Create Match">
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🎮</div>
          <h3 className="font-semibold text-base mb-2">No game selected</h3>
          <p className="text-muted-foreground text-sm">Go to Settings → Edit Profile to set your game first.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showBack backHref="/host" title="Create Match">
      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Match Details</h3>
            <span className="text-xs font-semibold bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
              {hostGame}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className={cn("grid gap-2", categories.length <= 3 ? "grid-cols-3" : "grid-cols-2")}>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all",
                    selectedCategory === cat.id
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-base">{cat.emoji}</span>
                  <span className="text-center leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
            {selectedCategory === "Esports" && (
              <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span>Esports matches are only visible to esports-verified players</span>
              </div>
            )}
          </div>

          {maps.length > 0 && selectedCategory !== "Esports" && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Map className="w-3.5 h-3.5" /> Map</Label>
              <Select value={selectedMap} onValueChange={setSelectedMap}>
                <SelectTrigger><SelectValue placeholder="Select map (optional)" /></SelectTrigger>
                <SelectContent>
                  {maps.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Team Size</Label>
            <div className="flex gap-2">
              {availableTeamSizes.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setTeamSize(p.value)}
                  className={cn(
                    "flex-1 py-2 rounded-xl border text-sm font-medium transition-all",
                    teamSize === p.value
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {activeCat && !activeCat.allowSquad && (
              <p className="text-xs text-yellow-500/80">⚠️ {activeCat.label} only supports Solo and Duo</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">Entry Fee (<GoldCoinIcon size="sm" />)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.entryFee}
                onChange={(e) => setForm(f => ({ ...f, entryFee: e.target.value }))}
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{teamSize > 1 ? "Team Slots" : "Player Slots"} <span className="text-muted-foreground font-normal text-xs">(max {maxSlots})</span></Label>
              <Input
                type="number"
                placeholder="e.g. 12"
                value={form.slots}
                onChange={(e) => setForm(f => ({ ...f, slots: e.target.value }))}
                min={2}
                max={maxSlots}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Start Date & Time</Label>
            <Input
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Add match rules, requirements, or any extra info for players..."
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Match Thumbnail <span className="text-destructive font-normal normal-case">*</span>
          </h3>
          <p className="text-xs text-muted-foreground">Select a banner image to show on your match card (required)</p>
          <div className="grid grid-cols-2 gap-2">
            {THUMBNAIL_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedThumbnail(selectedThumbnail === t.src ? "" : t.src)}
                className={cn(
                  "relative rounded-xl overflow-hidden border-2 transition-all aspect-video",
                  selectedThumbnail === t.src ? "border-primary scale-[1.02]" : "border-transparent opacity-70 hover:opacity-100"
                )}
              >
                <img src={t.src} alt={t.label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className="absolute bottom-1.5 left-2 text-xs font-semibold text-white">{t.label}</span>
                {selectedThumbnail === t.src && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-[10px] text-white font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
          {selectedThumbnail && (
            <button type="button" onClick={() => setSelectedThumbnail("")} className="text-xs text-muted-foreground hover:text-foreground underline">
              Remove thumbnail
            </button>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5" /> Prize Pool
          </h3>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Your Contribution <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                value={form.hostContribution}
                onChange={(e) => setForm(f => ({ ...f, hostContribution: e.target.value }))}
                min={0}
                max={hostBalance}
                className={contributionNum > hostBalance ? "border-destructive" : ""}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <p className="text-muted-foreground">
                Deducted from your wallet and added to the showcase prize.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Your wallet:</span>
              <GoldCoin amount={hostBalance.toFixed(0)} size="sm" />
              {contributionNum > hostBalance && (
                <span className="text-destructive font-medium ml-1">Insufficient balance</span>
              )}
            </div>
          </div>

          <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Showcase Prize Pool (auto-calculated)</p>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{slotsNum || "?"} slots × <GoldCoin amount={entryFeeNum || 0} size="sm" /> entry fee</span>
                  {contributionNum > 0 && <span className="text-green-400">+ <GoldCoin amount={contributionNum} size="sm" /> boost</span>}
                </div>
                <div className="text-xl font-bold text-amber-300">
                  <GoldCoin amount={showcasePrize} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Shown on card</div>
                <div className="w-16 h-8 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-center">
                  <span className="text-xs font-bold text-amber-400">🏆 Auto</span>
                </div>
              </div>
            </div>
            {(entryFeeNum === 0 || slotsNum === 0) && (
              <p className="text-xs text-muted-foreground">Enter entry fee and slots to see the prize pool.</p>
            )}
          </div>

          {contributionNum > 0 && (
            <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <Gift className="w-3.5 h-3.5 shrink-0" />
              You're boosting the prize pool by <GoldCoin amount={contributionNum.toFixed(0)} size="sm" />
            </div>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Reward Distribution
          </h3>
          <p className="text-xs text-muted-foreground">
            Define how the prize pool is split. Coins are calculated live based on the showcase prize.
          </p>
          <RewardDistributionTable
            categoryId={selectedCategory}
            showcasePrize={showcasePrize}
            distribution={distribution}
            onChange={setDistribution}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isPending || contributionNum > hostBalance}
        >
          {isPending ? "Creating..." : "Create Tournament"}
        </Button>
      </form>
    </AppLayout>
  );
}
