import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, MessageCircle, User, ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface HostApplication {
  id: number;
  userId: number;
  handle: string;
  name: string | null;
  gameIgn: string | null;
  phoneNumber: string | null;
  experience: string;
  previousHosting: string | null;
  proofImages: string[];
  status: "pending" | "approved" | "rejected";
  adminNotes: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  userAvatar: string | null;
  userGame: string | null;
  userTrustScore: number | null;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-2.5 py-0.5"><Clock className="w-3 h-3" /> Pending</span>;
  if (status === "approved") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-0.5"><CheckCircle className="w-3 h-3" /> Approved</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2.5 py-0.5"><XCircle className="w-3 h-3" /> Rejected</span>;
}

export default function AdminHostApplicationsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [apps, setApps] = useState<HostApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ app: HostApplication } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [acting, setActing] = useState(false);
  const [imageDialog, setImageDialog] = useState<string | null>(null);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const data = await customFetch<HostApplication[]>(`/api/admin/host-applications?status=${filter}`);
      setApps(data);
    } catch {
      toast({ title: "Failed to load applications", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchApps(); }, [filter]);

  const handleApprove = async (app: HostApplication) => {
    setActing(true);
    try {
      await customFetch(`/api/admin/host-applications/${app.id}/approve`, { method: "PATCH" });
      toast({ title: "Application approved!", description: `@${app.handle} is now a host.` });
      fetchApps();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Could not approve", variant: "destructive" });
    }
    setActing(false);
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    setActing(true);
    try {
      await customFetch(`/api/admin/host-applications/${rejectDialog.app.id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ notes: rejectNotes }),
      });
      toast({ title: "Application rejected" });
      setRejectDialog(null);
      setRejectNotes("");
      fetchApps();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Could not reject", variant: "destructive" });
    }
    setActing(false);
  };

  const pendingCount = apps.filter(a => a.status === "pending").length;

  return (
    <AppLayout title="Host Applications">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black">Host Applications</h1>
            <p className="text-xs text-muted-foreground">Review and manage player host requests</p>
          </div>
          {filter === "pending" && pendingCount > 0 && (
            <span className="text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-2.5 py-1">{pendingCount} pending</span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["pending", "all", "approved", "rejected"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors capitalize",
                filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : apps.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">No {filter !== "all" ? filter : ""} applications</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => (
              <div key={app.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                      {app.userAvatar || "🎮"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{app.userName || app.name || "Unknown"}</p>
                        <StatusBadge status={app.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">@{app.handle}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {app.userGame && <span className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">🎮 {app.userGame}</span>}
                        {app.userTrustScore != null && <span className="text-[10px] text-muted-foreground">Trust: {app.userTrustScore}</span>}
                        <span className="text-[10px] text-muted-foreground">{new Date(app.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button onClick={() => setExpanded(expanded === app.id ? null : app.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      {expanded === app.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {expanded === app.id && (
                    <div className="mt-4 space-y-3 border-t border-border pt-3">
                      {app.gameIgn && (
                        <div>
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">In-Game Name</p>
                          <p className="text-sm">{app.gameIgn}</p>
                        </div>
                      )}
                      {app.phoneNumber && (
                        <div>
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Phone</p>
                          <p className="text-sm">{app.phoneNumber}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Hosting Experience</p>
                        <p className="text-sm leading-relaxed">{app.experience}</p>
                      </div>
                      {app.previousHosting && (
                        <div>
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Previous Hosting</p>
                          <p className="text-sm leading-relaxed">{app.previousHosting}</p>
                        </div>
                      )}
                      {app.proofImages.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Proof Images ({app.proofImages.length})</p>
                          <div className="flex gap-2 flex-wrap">
                            {app.proofImages.map((img, i) => (
                              <button key={i} onClick={() => setImageDialog(`/api${img}`)}
                                className="w-16 h-16 rounded-xl bg-secondary/60 border border-border flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity">
                                <img src={`/api${img}`} alt={`proof-${i + 1}`} className="w-full h-full object-cover rounded-xl" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                <ImageIcon className="w-5 h-5 text-muted-foreground absolute" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {app.adminNotes && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-2.5">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Admin Notes</p>
                          <p className="text-xs">{app.adminNotes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="text-xs gap-1.5 flex-1" onClick={() => navigate(`/chat/${app.userId}`)}>
                      <MessageCircle className="w-3.5 h-3.5" /> Chat
                    </Button>
                    {app.status === "pending" && (
                      <>
                        <Button size="sm" className="text-xs gap-1.5 flex-1 bg-green-500 hover:bg-green-600 text-white" onClick={() => handleApprove(app)} disabled={acting}>
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="text-xs gap-1.5 flex-1" onClick={() => { setRejectDialog({ app }); setRejectNotes(""); }} disabled={acting}>
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!rejectDialog} onOpenChange={(v) => { if (!v) setRejectDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Application</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">You are rejecting the application from <span className="font-semibold text-foreground">@{rejectDialog?.app.handle}</span>.</p>
            <div className="space-y-1.5">
              <Label>Reason / Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea placeholder="Explain why the application is being rejected..." value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} rows={3} className="resize-none" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialog(null)} disabled={acting}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={acting}>{acting ? "Rejecting..." : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imageDialog} onOpenChange={(v) => { if (!v) setImageDialog(null); }}>
        <DialogContent className="max-w-sm p-2">
          <img src={imageDialog || ""} alt="proof" className="w-full rounded-xl object-contain max-h-[70vh]" />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
