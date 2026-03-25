import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GoldCoin } from "@/components/ui/Coins";
import { Plus, Gavel, Zap, Clock, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Auction = {
  id: number;
  title: string;
  tournamentName: string;
  status: "upcoming" | "live" | "completed" | "cancelled";
  teamsCount: number;
  totalPool: number;
  startTime: string | null;
  endTime: string | null;
};

const statusConfig = {
  upcoming: { label: "Upcoming", icon: Clock, class: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  live: { label: "LIVE", icon: Zap, class: "bg-green-500/20 text-green-400 border-green-500/30" },
  completed: { label: "Completed", icon: CheckCircle, class: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cancelled: { label: "Cancelled", icon: XCircle, class: "bg-destructive/20 text-destructive border-destructive/30" },
};

export default function AdminAuctionsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [games, setGames] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ game: "", tournamentName: "", startTime: "", endTime: "" });

  const load = () => {
    customFetch<Auction[]>("/api/auctions")
      .then(data => setAuctions(data.filter(a => a.status !== "cancelled")))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    customFetch<{ id: number; name: string }[]>("/api/games").then(setGames).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!form.game || !form.tournamentName.trim()) {
      toast({ title: "Please select a game and enter a tournament name", variant: "destructive" }); return;
    }
    setIsCreating(true);
    try {
      await customFetch("/api/auctions", {
        method: "POST",
        body: JSON.stringify({
          title: form.game,
          tournamentName: form.tournamentName.trim(),
          startTime: form.startTime || null,
          endTime: form.endTime || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Auction created!" });
      setForm({ game: "", tournamentName: "", startTime: "", endTime: "" });
      setCreateOpen(false);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AppLayout title="Auctions Management">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <Gavel className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-base">Auctions</h1>
              <p className="text-xs text-muted-foreground">Manage team auctions</p>
            </div>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Create Auction</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Choose Game</Label>
                  <Select value={form.game} onValueChange={val => setForm(f => ({ ...f, game: val }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a game..." />
                    </SelectTrigger>
                    <SelectContent>
                      {games.map(g => (
                        <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tournament Name</Label>
                  <Input value={form.tournamentName} onChange={e => setForm(f => ({ ...f, tournamentName: e.target.value }))} placeholder="e.g. BGMI Pro League S3" />
                </div>
                <div className="space-y-1.5">
                  <Label>Start Time (optional)</Label>
                  <Input type="datetime-local" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time (optional)</Label>
                  <Input type="datetime-local" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Auction"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No auctions yet</p>
            <p className="text-xs mt-1">Create your first auction above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {auctions.map(auction => {
              const cfg = statusConfig[auction.status];
              const StatusIcon = cfg.icon;
              return (
                <button
                  key={auction.id}
                  className="w-full text-left bg-card border border-card-border rounded-2xl p-4 hover:border-primary/40 transition-all active:scale-[0.98]"
                  onClick={() => navigate(`/admin/auctions/${auction.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5", cfg.class)}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <h3 className="font-bold text-base truncate">{auction.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{auction.tournamentName}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Teams</p>
                      <p className="text-sm font-bold">{auction.teamsCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total Pool</p>
                      <GoldCoin amount={auction.totalPool.toFixed(0)} size="sm" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
