import { useState } from "react";
import {
  useAdminDashboard, useAdminCreateHost, useAdminCreateAdmin
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Swords, DollarSign, AlertTriangle, UserPlus, Activity } from "lucide-react";

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
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

  const [hostForm, setHostForm] = useState({ email: "", password: "", name: "" });
  const [adminForm, setAdminForm] = useState({ email: "", password: "", name: "" });
  const [hostOpen, setHostOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const handleCreateHost = async () => {
    try {
      await createHost({ data: hostForm });
      toast({ title: "Host account created!" });
      setHostOpen(false);
      setHostForm({ email: "", password: "", name: "" });
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
              <StatCard icon={DollarSign} label="Total Revenue" value={`₹${data.totalRevenue.toFixed(0)}`} color="bg-green-500/20 text-green-400" />
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
                  {data.hostList.map((h) => (
                    <div key={h.id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-sm font-medium">{h.name || h.email}</div>
                        <div className="text-xs text-muted-foreground">{h.email}</div>
                      </div>
                    </div>
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
