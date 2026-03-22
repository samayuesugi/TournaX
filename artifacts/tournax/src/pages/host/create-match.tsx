import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateMatch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, Lock } from "lucide-react";

const GAMES = ["BGMI", "Free Fire", "PUBG Mobile", "Call of Duty Mobile", "Valorant Mobile", "Other"];

const TEAM_SIZE_PRESETS = [
  { label: "Solo", value: 1 },
  { label: "Duo", value: 2 },
  { label: "Squad", value: 4 },
];

export default function CreateMatchPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutateAsync: createMatch, isPending } = useCreateMatch();

  const [selectedGame, setSelectedGame] = useState<string>("");
  const [teamSize, setTeamSize] = useState<number>(1);
  const [prizeType, setPrizeType] = useState<"dynamic" | "fixed">("dynamic");
  const [form, setForm] = useState({
    mode: "",
    entryFee: "",
    slots: "",
    startTime: "",
    fixedPrize: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGame || !form.mode.trim() || !form.startTime || !form.entryFee || !form.slots) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    if (prizeType === "fixed" && !form.fixedPrize) {
      toast({ title: "Enter the fixed prize amount", variant: "destructive" });
      return;
    }
    try {
      const match = await createMatch({
        data: {
          game: selectedGame,
          mode: form.mode.trim(),
          teamSize,
          entryFee: parseFloat(form.entryFee),
          slots: parseInt(form.slots),
          startTime: new Date(form.startTime).toISOString(),
          prizeType,
          fixedPrize: prizeType === "fixed" ? parseFloat(form.fixedPrize) : undefined,
        } as any,
      });
      toast({ title: "Match created!" });
      navigate(`/matches/${match.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create match", description: err?.data?.error, variant: "destructive" });
    }
  };

  const dynamicPrize = form.entryFee && form.slots
    ? (parseFloat(form.entryFee) * parseInt(form.slots) * 0.8).toFixed(0)
    : null;

  return (
    <AppLayout showBack title="Create Match">
      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Match Details</h3>

          <div className="space-y-1.5">
            <Label>Game</Label>
            <Select value={selectedGame} onValueChange={setSelectedGame}>
              <SelectTrigger><SelectValue placeholder="Select game" /></SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Input
              placeholder="e.g. Battle Royale, TDM, Clash Squad..."
              value={form.mode}
              onChange={(e) => setForm(f => ({ ...f, mode: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Team Size</Label>
            <div className="flex gap-2">
              {TEAM_SIZE_PRESETS.map((p) => (
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
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Custom"
                  value={TEAM_SIZE_PRESETS.some(p => p.value === teamSize) ? "" : String(teamSize)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) setTeamSize(v);
                  }}
                  className="w-24 text-center"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {teamSize === 1 ? "Solo — 1 player per slot" : teamSize === 2 ? "Duo — 2 players per slot" : `${teamSize} players per slot`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Entry Fee (₹)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.entryFee}
                onChange={(e) => setForm(f => ({ ...f, entryFee: e.target.value }))}
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total Slots</Label>
              <Input
                type="number"
                placeholder="e.g. 25"
                value={form.slots}
                onChange={(e) => setForm(f => ({ ...f, slots: e.target.value }))}
                min={2}
                max={100}
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
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Prize Pool
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPrizeType("dynamic")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-sm font-medium",
                prizeType === "dynamic"
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Dynamic</span>
              <span className="text-[10px] font-normal opacity-70">Grows as players join</span>
            </button>
            <button
              type="button"
              onClick={() => setPrizeType("fixed")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-sm font-medium",
                prizeType === "fixed"
                  ? "bg-accent/10 border-accent text-accent"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Lock className="w-4 h-4" />
              <span>Fixed</span>
              <span className="text-[10px] font-normal opacity-70">Set by you, guaranteed</span>
            </button>
          </div>

          {prizeType === "dynamic" ? (
            <div className="bg-secondary/50 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Max Prize Pool</span>
                <span className="font-bold text-accent text-base">₹{dynamicPrize ?? "—"}</span>
              </div>
              <p className="text-xs text-muted-foreground">80% of total entry fees. Pool grows as players join.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Fixed Prize Amount (₹)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={form.fixedPrize}
                onChange={(e) => setForm(f => ({ ...f, fixedPrize: e.target.value }))}
                min={0}
              />
              <p className="text-xs text-muted-foreground">This amount will always be shown as the prize, regardless of how many players join.</p>
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
