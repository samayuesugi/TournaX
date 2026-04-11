import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Star, Shield, Ban, CheckCircle, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

interface Host {
  id: number;
  name: string;
  email: string;
  handle: string | null;
  avatar: string | null;
  game: string | null;
  status: string;
  recommended: boolean;
  hostBadge: string;
  hostRatingAvg: number;
  hostRatingCount: number;
  matchCount: number;
  createdAt: string;
}

export default function HostManagementPage() {
  const { toast } = useToast();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmHost, setConfirmHost] = useState<{ host: Host; action: "ban" | "unban" } | null>(null);
  const [acting, setActing] = useState(false);

  const fetchHosts = async () => {
    setLoading(true);
    try {
      const data = await customFetch<Host[]>("/api/admin/hosts-list");
      setHosts(data);
    } catch {
      toast({ title: "Failed to load hosts", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchHosts(); }, []);

  const handleStatusChange = async () => {
    if (!confirmHost) return;
    setActing(true);
    const newStatus = confirmHost.action === "ban" ? "banned" : "active";
    try {
      await customFetch(`/api/admin/hosts/${confirmHost.host.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
        responseType: "json",
      });
      toast({ title: confirmHost.action === "ban" ? "Host banned" : "Host unbanned" });
      setConfirmHost(null);
      fetchHosts();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed", variant: "destructive" });
    }
    setActing(false);
  };

  const handleRecommend = async (host: Host) => {
    try {
      const res = await customFetch<{ recommended: boolean }>(`/api/admin/hosts/${host.id}/recommend`, {
        method: "PATCH", responseType: "json",
      });
      setHosts(hs => hs.map(h => h.id === host.id ? { ...h, recommended: res.recommended } : h));
      toast({ title: res.recommended ? "Marked as recommended" : "Removed from recommended" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Host Management" showBack backHref="/admin">
      <div className="space-y-3 pb-4">
        <p className="text-xs text-muted-foreground">{hosts.length} total host{hosts.length !== 1 ? "s" : ""}</p>

        {loading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : hosts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No hosts yet</div>
        ) : (
          hosts.map(h => (
            <div key={h.id} className={cn("bg-card border rounded-xl px-4 py-3", h.status === "banned" ? "border-destructive/30" : "border-card-border")}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0 overflow-hidden">
                  {h.avatar && (h.avatar.startsWith("/") || h.avatar.startsWith("http"))
                    ? <img src={h.avatar} alt={h.name || ""} className="w-full h-full object-cover" />
                    : h.avatar || "🎮"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-sm truncate">{h.name || h.email}</span>
                    {h.status === "banned" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">Banned</span>}
                    {h.recommended && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 font-medium">⭐ Featured</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{h.email}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {h.game && <span>🎮 {h.game}</span>}
                    <span><Swords className="w-3 h-3 inline mr-0.5" />{h.matchCount} matches</span>
                    {h.hostRatingCount > 0 && <span><Star className="w-3 h-3 inline mr-0.5" />{h.hostRatingAvg.toFixed(1)} ({h.hostRatingCount})</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1"
                  onClick={() => handleRecommend(h)}>
                  <Star className="w-3.5 h-3.5" />
                  {h.recommended ? "Unfeature" : "Feature"}
                </Button>
                {h.status === "banned" ? (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 text-green-600 border-green-500/30"
                    onClick={() => setConfirmHost({ host: h, action: "unban" })}>
                    <CheckCircle className="w-3.5 h-3.5" /> Unban
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 text-destructive border-destructive/30"
                    onClick={() => setConfirmHost({ host: h, action: "ban" })}>
                    <Ban className="w-3.5 h-3.5" /> Ban
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!confirmHost} onOpenChange={() => setConfirmHost(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmHost?.action === "ban" ? "Ban Host?" : "Unban Host?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmHost?.action === "ban"
              ? `${confirmHost?.host.name} will be banned and cannot create matches.`
              : `${confirmHost?.host.name} will be reinstated and can create matches again.`}
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmHost(null)}>Cancel</Button>
            <Button variant={confirmHost?.action === "ban" ? "destructive" : "default"}
              onClick={handleStatusChange} disabled={acting}>
              {acting ? "Updating..." : confirmHost?.action === "ban" ? "Ban" : "Unban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
