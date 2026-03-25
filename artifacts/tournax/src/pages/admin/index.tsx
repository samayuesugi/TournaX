import { useState, useEffect, type ReactNode } from "react";
import {
  useAdminDashboard, useAdminCreateHost, useAdminCreateAdmin, customFetch
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Swords, DollarSign, AlertTriangle, UserPlus, Activity, Gamepad2 } from "lucide-react";
import { GoldCoin } from "@/components/ui/Coins";

function HostRow({ host }: { host: any }) {
  const { toast } = useToast();
  const [recommended, setRecommended] = useState<boolean>(host.recommended);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await customFetch<{ recommended: boolean }>(`/api/admin/hosts/${host.id}/recommend`, {
        method: "PATCH",
        responseType: "json",
      });
      setRecommended(res.recommended);
      toast({ title: res.recommended ? "Recommendation ON" : "Recommendation OFF" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-secondary/40 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{host.name || host.email}</div>
          <div className="text-xs text-muted-foreground truncate">{host.email}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {host.game && (
            <span className="flex items-center gap-1 text-xs font-medium bg-primary/15 text-primary border border-primary/30 rounded-full px-2 py-0.5">
              <Gamepad2 className="w-3 h-3" />
              {host.game}
            </span>
          )}
          <button
            onClick={toggle}
            disabled={loading}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
              recommended
                ? "bg-green-500/20 text-green-400 border-green-500/40"
                : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {recommended ? "✓ Recommended" : "Recommend"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: ReactNode; color: string }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data, isLoading, refetch } = useAdminDashboard();
  const { toast } = useToast();
  const { mutateAsync: createHost, isPending: isCreatingHost } = useAdminCreateHost();
  const { mutateAsync: createAdmin, isPending: isCreatingAdmin } = useAdminCreateAdmin();

  const [hostForm, setHostForm] = useState({ email: "", password: "", name: "", game: "" });
  const [adminForm, setAdminForm] = useState({ email: "", password: "", name: "" });
  const [hostOpen, setHostOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [games, setGames] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (hostOpen) {
      customFetch<{ id: number; name: string; modes: any[] }[]>("/api/games", { responseType: "json" })
        .then((res) => setGames(res.map(g => ({ id: g.id, name: g.name }))))
        .catch(() => {});
    }
  }, [hostOpen]);

  const handleCreateHost = async () => {
    try {
      await createHost({ data: hostForm });
      toast({ title: "Host account created!" });
      setHostOpen(false);
      setHostForm({ email: "", password: "", name: "", game: "" });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleCreateAdmin = async () => {
    try {
      await createAdmin({ data: adminForm });
      toast({ title: "Admin account created!" });
      setAdminOpen(false);
      setAdminForm({ email: "", password: "", name: "" });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Admin Dashboard">
      <div className="space-y-4 pb-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Users} label="Total Players" value={data.totalPlayers} color="bg-primary/20 text-primary" />
              <StatCard icon={Activity} label="Live Now" value={data.liveNow} color="bg-green-500/20 text-green-400" />
              <StatCard icon={Swords} label="Total Matches" value={data.totalMatches} color="bg-accent/20 text-accent" />
              <StatCard icon={AlertTriangle} label="Pending KYC" value={data.pendingKyc} color="bg-yellow-500/20 text-yellow-400" />
              <StatCard icon={DollarSign} label="Total Revenue" value={<GoldCoin amount={data.totalRevenue.toFixed(0)} />} color="bg-green-500/20 text-green-400" />
              <StatCard icon={AlertTriangle} label="Complaints" value={data.complaintsCount} color="bg-destructive/20 text-destructive" />
            </div>

            <div className="bg-card border border-card-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Quick Actions</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Dialog open={hostOpen} onOpenChange={setHostOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-10">
                      <UserPlus className="w-3.5 h-3.5" /> New Host
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Create Host Account</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input value={hostForm.name} onChange={(e) => setHostForm(f => ({ ...f, name: e.target.value }))} placeholder="Host name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={hostForm.email} onChange={(e) => setHostForm(f => ({ ...f, email: e.target.value }))} placeholder="host@email.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Password</Label>
                        <Input type="password" value={hostForm.password} onChange={(e) => setHostForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Gamepad2 className="w-3.5 h-3.5" /> Game Specialization
                        </Label>
                        <select
                          value={hostForm.game}
                          onChange={(e) => setHostForm(f => ({ ...f, game: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">— Select game —</option>
                          {games.map(g => (
                            <option key={g.id} value={g.name}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                      <Button className="w-full" onClick={handleCreateHost} disabled={isCreatingHost}>
                        {isCreatingHost ? "Creating..." : "Create Host"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-10">
                      <UserPlus className="w-3.5 h-3.5" /> New Admin
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Create Admin Account</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input value={adminForm.name} onChange={(e) => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder="Admin name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={adminForm.email} onChange={(e) => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@email.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Password</Label>
                        <Input type="password" value={adminForm.password} onChange={(e) => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" />
                      </div>
                      <Button className="w-full" onClick={handleCreateAdmin} disabled={isCreatingAdmin}>
                        {isCreatingAdmin ? "Creating..." : "Create Admin"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {data.hostList.length > 0 && (
              <div className="bg-card border border-card-border rounded-2xl p-4">
                <h3 className="font-semibold text-sm mb-3">Hosts ({data.hostList.length})</h3>
                <div className="space-y-2">
                  {data.hostList.map((h: any) => (
                    <HostRow key={h.id} host={h} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
