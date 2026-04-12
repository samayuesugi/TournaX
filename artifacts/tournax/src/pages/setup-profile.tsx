import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/contexts/useAuth";
import { useSetupProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const GAMES = ["BGMI", "Free Fire", "COD Mobile", "Valorant", "PUBG PC", "Other"];
const AVATARS = ["🎮", "🏆", "⚔️", "🔥", "💀", "👑", "🎯", "🦾", "🤑", "🤒", "😴", "🧔", "👩‍🦰", "🐲", "⚡️", "🗿"];

export default function SetupProfilePage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutateAsync: setupProfile, isPending } = useSetupProfile();

  const [form, setForm] = useState({
    avatar: AVATARS[0],
    name: "",
    handle: "",
    game: "",
  });

  if (!isLoading && !user) {
    return <Redirect to="/auth" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await setupProfile({ data: form as any });
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
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="TournaX"
              className="w-10 h-10 object-contain"
            />
            <span className="text-xl font-bold">TournaX</span>
          </div>
          <h2 className="text-xl font-bold">Set Up Your Profile</h2>
          <p className="text-muted-foreground text-sm mt-1">One-time setup to start competing</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Choose Avatar</Label>
              <div className="grid grid-cols-8 gap-1.5">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, avatar: av }))}
                    className={`text-xl h-9 w-full rounded-lg flex items-center justify-center transition-all ${form.avatar === av ? "bg-primary/30 ring-2 ring-primary" : "bg-secondary hover:bg-secondary/80"}`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Full Name</Label>
              <Input
                placeholder="Your display name"
                value={form.name}
                onChange={(e) => {
                  const val = e.target.value.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
                  setForm(f => ({ ...f, name: val }));
                }}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Username (handle)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  placeholder="yourhandle"
                  value={form.handle}
                  onChange={(e) => setForm(f => ({ ...f, handle: e.target.value.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, "") }))}
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

            <Button type="submit" className="w-full" disabled={isPending || !form.game || !form.name || !form.handle}>
              {isPending ? "Setting up..." : "Start Playing"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
