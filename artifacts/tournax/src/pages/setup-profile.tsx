import { useState } from "react";
import { useLocation } from "wouter";
import { Zap, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSetupProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const GAMES = ["BGMI", "Free Fire", "PUBG Mobile", "Call of Duty Mobile", "Valorant Mobile", "Other"];
const AVATARS = ["🎮", "🏆", "⚔️", "🔥", "💀", "👑", "🎯", "🦾"];

export default function SetupProfilePage() {
  const { setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutateAsync: setupProfile, isPending } = useSetupProfile();

  const [form, setForm] = useState({
    avatar: AVATARS[0],
    game: "",
    ign: "",
    handle: "",
    gameUid: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await setupProfile({ data: form });
      setUser(user);
      navigate("/");
    } catch (err: any) {
      toast({ title: "Setup failed", description: err?.data?.error || "Please check your details", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="w-6 h-6 text-primary fill-primary" />
            <span className="text-xl font-bold">TournaX</span>
          </div>
          <h2 className="text-xl font-bold">Set Up Your Profile</h2>
          <p className="text-muted-foreground text-sm mt-1">One-time setup to start competing</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Choose Avatar</Label>
              <div className="grid grid-cols-4 gap-2">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    className={`text-2xl p-3 rounded-xl border transition-all ${form.avatar === avatar ? "border-primary bg-primary/20" : "border-border bg-secondary/50 hover:border-border/80"}`}
                    onClick={() => setForm(f => ({ ...f, avatar }))}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Username (handle)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  placeholder="yourhandle"
                  value={form.handle}
                  onChange={(e) => setForm(f => ({ ...f, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  className="pl-7"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Game</Label>
              <Select value={form.game} onValueChange={(v) => setForm(f => ({ ...f, game: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your game" />
                </SelectTrigger>
                <SelectContent>
                  {GAMES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">IGN (In-Game Name)</Label>
              <Input
                placeholder="Your in-game name"
                value={form.ign}
                onChange={(e) => setForm(f => ({ ...f, ign: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Game UID</Label>
              <Input
                placeholder="Your game UID / player ID"
                value={form.gameUid}
                onChange={(e) => setForm(f => ({ ...f, gameUid: e.target.value }))}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending || !form.game}>
              {isPending ? "Setting up..." : "Start Playing"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
