import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateMatch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const GAMES = ["BGMI", "Free Fire", "PUBG Mobile", "Call of Duty Mobile", "Valorant Mobile", "Other"];
const MODES = ["Squad", "Duo", "Solo", "Custom"];
const TEAM_SIZES = [1, 2, 4];

export default function CreateMatchPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutateAsync: createMatch, isPending } = useCreateMatch();

  const [form, setForm] = useState({
    game: "",
    mode: "",
    teamSize: 4,
    entryFee: "",
    slots: "",
    startTime: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.game || !form.mode || !form.startTime || !form.entryFee || !form.slots) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    try {
      const match = await createMatch({
        data: {
          game: form.game,
          mode: form.mode,
          teamSize: form.teamSize,
          entryFee: parseFloat(form.entryFee),
          slots: parseInt(form.slots),
          startTime: new Date(form.startTime).toISOString(),
        },
      });
      toast({ title: "Match created!" });
      navigate(`/matches/${match.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create match", description: err?.data?.error, variant: "destructive" });
    }
  };

  const prizePool = form.entryFee && form.slots
    ? (parseFloat(form.entryFee) * parseInt(form.slots) * 0.8).toFixed(0)
    : "—";

  return (
    <AppLayout showBack title="Create Match">
      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Match Details</h3>

          <div className="space-y-1.5">
            <Label>Game</Label>
            <Select value={form.game} onValueChange={(v) => setForm(f => ({ ...f, game: v }))}>
              <SelectTrigger><SelectValue placeholder="Select game" /></SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v) => setForm(f => ({ ...f, mode: v }))}>
              <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
              <SelectContent>
                {MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Team Size</Label>
            <div className="grid grid-cols-3 gap-2">
              {TEAM_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${form.teamSize === size ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border hover:border-primary/40"}`}
                  onClick={() => setForm(f => ({ ...f, teamSize: size }))}
                >
                  {size === 1 ? "Solo" : size === 2 ? "Duo (2)" : "Squad (4)"}
                </button>
              ))}
            </div>
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

        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Estimated Prize Pool</span>
            <span className="font-bold text-accent text-lg">₹{prizePool}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">80% of total entry fees (20% platform fee)</p>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? "Creating..." : "Create Tournament"}
        </Button>
      </form>
    </AppLayout>
  );
}
