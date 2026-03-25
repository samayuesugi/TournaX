import { useState } from "react";
import { Search } from "lucide-react";
import {
  useAdminListPlayers, useVerifyPlayer, useBanPlayer, useAdminAddBalance
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin } from "@/components/ui/Coins";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AdminPlayer } from "@workspace/api-client-react";

const STATUS_FILTERS = ["all", "pending", "verified", "banned"] as const;

function PlayerRow({ player, onAction }: { player: AdminPlayer; onAction: () => void }) {
  const { toast } = useToast();
  const { mutateAsync: verify } = useVerifyPlayer();
  const { mutateAsync: ban } = useBanPlayer();
  const { mutateAsync: addBalance } = useAdminAddBalance();
  const [amount, setAmount] = useState("");
  const [balanceOpen, setBalanceOpen] = useState(false);

  const handleVerify = async () => {
    try {
      await verify({ id: player.id });
      toast({ title: "Player verified!" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleBan = async () => {
    if (!confirm(`Ban ${player.name || player.email}?`)) return;
    try {
      await ban({ id: player.id });
      toast({ title: "Player banned" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleAddBalance = async () => {
    try {
      await addBalance({ id: player.id, data: { amount: parseFloat(amount) } });
      toast({ title: `${amount} Gold Coins added to ${player.name || player.email}` });
      setBalanceOpen(false);
      setAmount("");
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const statusColor = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    banned: "bg-destructive/20 text-destructive border-destructive/30",
  }[player.status] ?? "bg-secondary text-muted-foreground border-border";

  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{player.name || "—"}</div>
          <div className="text-xs text-muted-foreground">{player.email}</div>
          {player.handle && <div className="text-xs text-accent">@{player.handle}</div>}
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize shrink-0", statusColor)}>
          {player.status}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span>Balance: <span className="text-foreground font-medium"><GoldCoin amount={player.balance.toFixed(0)} /></span></span>
        <span>Matches: <span className="text-foreground font-medium">{player.matchesPlayed}</span></span>
        {player.uid && <span>UID: <span className="font-mono text-foreground">{player.uid}</span></span>}
      </div>

      <div className="flex gap-2">
        {player.status === "pending" && (
          <Button size="sm" className="h-7 text-xs flex-1" onClick={handleVerify}>Verify</Button>
        )}
        {player.status !== "banned" && (
          <Button variant="destructive" size="sm" className="h-7 text-xs flex-1" onClick={handleBan}>Ban</Button>
        )}
        <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs flex-1">+ Balance</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Balance</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Adding balance to: <strong>{player.name || player.email}</strong></p>
              <div className="space-y-1.5">
                <Label>Amount (Gold Coins)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" />
              </div>
              <Button className="w-full" onClick={handleAddBalance} disabled={!amount}>Add Balance</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function AdminPlayersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<typeof STATUS_FILTERS[number]>("all");
  const { data, isLoading, refetch } = useAdminListPlayers({ search: search || undefined, status });

  return (
    <AppLayout title="Players">
      <div className="space-y-4 pb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search players..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 border transition-all capitalize",
                status === f ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : data?.length ? (
          <div className="space-y-3">
            {data.map((p) => <PlayerRow key={p.id} player={p} onAction={refetch} />)}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">No players found</div>
        )}
      </div>
    </AppLayout>
  );
}
