import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Swords, Trash2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Match {
  id: number;
  code: string;
  game: string;
  mode: string;
  status: "upcoming" | "live" | "completed";
  entryFee: number;
  slots: number;
  filledSlots: number;
  startTime: string;
  hostName: string;
  hostHandle: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-yellow-500/15 text-yellow-600",
  live: "bg-green-500/15 text-green-600",
  completed: "bg-muted text-muted-foreground",
};

export default function MatchManagementPage() {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const data = await customFetch<Match[]>(`/api/admin/matches${filter !== "all" ? `?status=${filter}` : ""}`);
      setMatches(data);
    } catch {
      toast({ title: "Failed to load matches", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchMatches(); }, [filter]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await customFetch(`/api/admin/matches/${deleteId}`, { method: "DELETE", responseType: "json" });
      toast({ title: "Match deleted" });
      setDeleteId(null);
      fetchMatches();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to delete", variant: "destructive" });
    }
    setDeleting(false);
  };

  const filters = ["all", "upcoming", "live", "completed"];

  return (
    <AppLayout title="Match Management" showBack backHref="/admin">
      <div className="space-y-4 pb-4">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize border",
                filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : matches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Swords className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No matches found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map(m => (
              <div key={m.id} className="bg-card border border-card-border rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-primary">{m.code}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", STATUS_COLORS[m.status])}>{m.status}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{m.game} · {m.mode}</p>
                    <p className="text-xs text-muted-foreground">Host: {m.hostName} {m.hostHandle ? `(@${m.hostHandle})` : ""}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>₹{m.entryFee} entry</span>
                      <span>{m.filledSlots}/{m.slots} slots</span>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => setDeleteId(m.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Match?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the match and refund all participants. This cannot be undone.</p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
