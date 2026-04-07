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
import { Gift, ImageIcon, Map, Wallet } from "lucide-react";
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

const TEAM_SIZES = [
  { label: "Solo", value: 1 },
  { label: "Duo", value: 2 },
  { label: "Squad", value: 4 },
];

export default function CreateMatchPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { mutateAsync: createMatch, isPending } = useCreateMatch();
  const { data: wallet } = useGetWallet();

  const hostGame = (user as any)?.game ?? "";
  const isFF = hostGame === "Free Fire";
  const isBGMI = hostGame === "BGMI";

  const categories = isFF ? FF_CATEGORIES : isBGMI ? BGMI_CATEGORIES : [];
  const maps = isFF ? FF_MAPS : isBGMI ? BGMI_MAPS : [];
  const maxSlots = isFF ? 50 : 100;

  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id ?? "");
  const activeCat = categories.find(c => c.id === selectedCategory);
  const allowSquad = activeCat?.allowSquad ?? true;
  const availableTeamSizes = allowSquad ? TEAM_SIZES : TEAM_SIZES.filter(t => t.value !== 4);

  const [teamSize, setTeamSize] = useState<number>(1);
  const [selectedMap, setSelectedMap] = useState<string>("");
  const [selectedThumbnail, setSelectedThumbnail] = useState<string>("");
  const [form, setForm] = useState({
    entryFee: "",
    slots: "",
    startTime: "",
    showcasePrizePool: "",
    hostContribution: "",
    description: "",
  });

  useEffect(() => {
    if (!allowSquad && teamSize === 4) setTeamSize(1);
  }, [selectedCategory, allowSquad]);

  useEffect(() => {
    if (categories.length > 0) setSelectedCategory(categories[0].id);
  }, [hostGame]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !form.startTime || !form.entryFee || !form.slots) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    if (!selectedThumbnail) {
      toast({ title: "Select a match thumbnail", variant: "destructive" });
      return;
    }
    if (!form.showcasePrizePool) {
      toast({ title: "Enter the showcase prize pool amount", variant: "destructive" });
      return;
    }
    const slotsNum = parseInt(form.slots);
    if (slotsNum > maxSlots) {
      toast({ title: `Max ${maxSlots} slots for ${hostGame}`, variant: "destructive" });
      return;
    }
    try {
      const match = await createMatch({
        data: {
          game: hostGame,
          mode: selectedCategory,
          category: selectedCategory,
          map: selectedMap || undefined,
          teamSize,
          entryFee: parseFloat(form.entryFee),
          slots: slotsNum,
          startTime: new Date(form.startTime).toISOString(),
          showcasePrizePool: parseFloat(form.showcasePrizePool),
          hostContribution: form.hostContribution ? parseFloat(form.hostContribution) : 0,
          description: form.description.trim() || undefined,
          thumbnailImage: selectedThumbnail || undefined,
        } as any,
      });
      toast({ title: "Match created!" });
      navigate(`/matches/${match.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create match", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const entryFeeNum = parseFloat(form.entryFee) || 0;
  const slotsNum = parseInt(form.slots) || 0;
  const contributionNum = parseFloat(form.hostContribution) || 0;
  const hostBalance = wallet?.balance ?? 0;
  const previewPlayers = Math.min(slotsNum, 4);
  const previewEntryPool = previewPlayers * entryFeeNum;
  const previewIsLarge = slotsNum >= 8;
  const previewWinners = Math.round(previewEntryPool * (previewIsLarge ? 0.85 : 0.90) + contributionNum);
  const previewHost = Math.round(previewEntryPool * (previewIsLarge ? 0.10 : 0.05));
  const previewPlatform = Math.round(previewEntryPool * 0.05);

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
            <div className="grid grid-cols-3 gap-2">
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
          </div>

          {maps.length > 0 && (
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
              <Label>Total Slots <span className="text-muted-foreground font-normal text-xs">(max {maxSlots})</span></Label>
              <Input
                type="number"
                placeholder={`e.g. 25`}
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
            <Label className="flex items-center gap-1">Showcase Prize Pool (<GoldCoinIcon size="sm" />)</Label>
            <Input
              type="number"
              placeholder="e.g. 5000"
              value={form.showcasePrizePool}
              onChange={(e) => setForm(f => ({ ...f, showcasePrizePool: e.target.value }))}
              min={0}
            />
            <p className="text-xs text-muted-foreground">
              This is the guaranteed prize pool shown on the match card. The live pool grows as players join.
            </p>
          </div>

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
                This amount will be deducted from your wallet and added entirely to the winners prize pool.
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

          {entryFeeNum > 0 && (
            <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Live pool preview (at {previewPlayers} players)</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-green-400"><GoldCoin amount={previewWinners} size="sm" /></div>
                  <div className="text-[10px] text-muted-foreground">Winners {previewIsLarge ? 85 : 90}%{contributionNum > 0 ? " + Boost" : ""}</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground"><GoldCoin amount={previewHost} size="sm" /></div>
                  <div className="text-[10px] text-muted-foreground">Host {previewIsLarge ? 10 : 5}%</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground"><GoldCoin amount={previewPlatform} size="sm" /></div>
                  <div className="text-[10px] text-muted-foreground">Platform 5%</div>
                </div>
              </div>
              {contributionNum > 0 && (
                <div className="mt-1 text-center text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg py-1.5">
                  🏆 You're boosting the prize pool by <GoldCoin amount={contributionNum.toFixed(0)} size="sm" />
                </div>
              )}
            </div>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? "Creating..." : "Create Tournament"}
        </Button>
      </form>
    </AppLayout>
  );
}
