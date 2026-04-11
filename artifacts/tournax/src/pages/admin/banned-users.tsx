import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Ban, CheckCircle } from "lucide-react";

interface BannedUser {
  id: number;
  name: string | null;
  email: string;
  handle: string | null;
  avatar: string | null;
  role: string;
  trustScore: number;
  createdAt: string;
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export default function BannedUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmUser, setConfirmUser] = useState<BannedUser | null>(null);
  const [unbanning, setUnbanning] = useState(false);

  const fetchBanned = async () => {
    setLoading(true);
    try {
      const data = await customFetch<BannedUser[]>("/api/admin/banned");
      setUsers(data);
    } catch {
      toast({ title: "Failed to load banned users", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchBanned(); }, []);

  const handleUnban = async () => {
    if (!confirmUser) return;
    setUnbanning(true);
    try {
      await customFetch(`/api/admin/players/${confirmUser.id}/unban`, { method: "POST", responseType: "json" });
      toast({ title: "User unbanned", description: `${confirmUser.name || confirmUser.email} can now access the platform.` });
      setConfirmUser(null);
      fetchBanned();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed", variant: "destructive" });
    }
    setUnbanning(false);
  };

  return (
    <AppLayout title="Banned Users" showBack backHref="/admin">
      <div className="space-y-3 pb-4">
        <p className="text-xs text-muted-foreground">{users.length} banned account{users.length !== 1 ? "s" : ""}</p>

        {loading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No banned users</p>
          </div>
        ) : (
          users.map(u => (
            <div key={u.id} className="bg-card border border-destructive/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0 overflow-hidden">
                  {u.avatar && (u.avatar.startsWith("/") || u.avatar.startsWith("http"))
                    ? <img src={u.avatar} alt={u.name || ""} className="w-full h-full object-cover" />
                    : u.avatar || "🔥"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-sm truncate">{u.name || u.email}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium capitalize">{u.role}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>Trust: {u.trustScore}</span>
                    {u.handle && <span>@{u.handle}</span>}
                    <span>{timeAgo(u.createdAt)}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-green-600 border-green-500/30 shrink-0"
                  onClick={() => setConfirmUser(u)}>
                  <CheckCircle className="w-3.5 h-3.5" /> Unban
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Unban User?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmUser?.name || confirmUser?.email} will regain full access to the platform.
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmUser(null)}>Cancel</Button>
            <Button onClick={handleUnban} disabled={unbanning}>
              {unbanning ? "Unbanning..." : "Unban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
