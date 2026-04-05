import { useState } from "react";
import { useAdminListComplaints, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin } from "@/components/ui/Coins";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ImageIcon, ChevronDown, ChevronUp,
  Wallet, Swords, User, Mail, LogOut, Flag, ShieldCheck, Settings,
  IndianRupee, Trash2,
} from "lucide-react";

type EarningEntry = {
  id: number;
  matchCode: string;
  amount: string;
  createdAt: string;
  hostName: string;
  hostHandle: string | null;
};

type WalletData = {
  earnings: EarningEntry[];
  total: string;
};

function resolveAvatarSrc(avatar: string): string {
  if (avatar.startsWith("/objects/")) return `/api/storage${avatar}`;
  return avatar;
}

function AvatarDisplay({ avatar, name, className }: { avatar?: string | null; name?: string | null; className?: string }) {
  if (avatar && (avatar.startsWith("/") || avatar.startsWith("http"))) {
    return <img src={resolveAvatarSrc(avatar)} alt={name || ""} className={`object-cover ${className ?? ""}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-primary/20 text-3xl ${className ?? ""}`}>
      {avatar || "🛡️"}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function PlatformWalletSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);

  const { data, isLoading } = useQuery<WalletData>({
    queryKey: ["admin-platform-earnings"],
    queryFn: () => customFetch<WalletData>("/api/admin/platform-earnings", { responseType: "json" }),
    staleTime: 15000,
  });

  const clearHistory = async () => {
    setClearing(true);
    try {
      await customFetch("/api/admin/platform-earnings", { method: "DELETE", responseType: "json" });
      queryClient.invalidateQueries({ queryKey: ["admin-platform-earnings"] });
      toast({ title: "History cleared" });
    } catch {
      toast({ title: "Failed to clear", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Platform Wallet</h3>
      </div>

      <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-0.5">Total Collected</p>
          {isLoading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <div className="flex items-baseline gap-0.5">
              <IndianRupee className="w-4 h-4 text-foreground" />
              <span className="text-2xl font-bold tracking-tight">
                {parseFloat(data?.total ?? "0").toFixed(2)}
              </span>
            </div>
          )}
        </div>
        {!isLoading && (
          <span className="text-xs text-muted-foreground shrink-0">{data?.earnings.length ?? 0} entries</span>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="text-sm font-semibold">Fee History</h4>
          {data && data.earnings.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5 px-2">
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all platform fee records. The collected balance is not affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearHistory}
                    disabled={clearing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : data && data.earnings.length > 0 ? (
          <div className="divide-y divide-border">
            {[...data.earnings].reverse().map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                  <IndianRupee className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{entry.hostName}</span>
                    {entry.hostHandle && (
                      <span className="text-xs text-muted-foreground">{entry.hostHandle}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                      #{entry.matchCode}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-green-400 shrink-0">
                  +<GoldCoin amount={parseFloat(entry.amount).toFixed(2)} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">💰</div>
            <p className="text-sm font-medium">No fees collected yet</p>
            <p className="text-xs text-muted-foreground mt-1">Platform fees (5%) appear here after matches complete</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ComplaintCard({ c }: { c: any }) {
  const [expandedImage, setExpandedImage] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const topicColor: Record<string, string> = {
    "Withdrawal Issue": "text-orange-400 bg-orange-500/10 border-orange-500/30",
    "Add Balance Issue": "text-blue-400 bg-blue-500/10 border-blue-500/30",
    "Bugs": "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    "Host Issues": "text-red-400 bg-red-500/10 border-red-500/30",
    "Other": "text-muted-foreground bg-secondary/60 border-border",
  };

  const topicIcon: Record<string, string> = {
    "Withdrawal Issue": "💸",
    "Add Balance Issue": "💳",
    "Bugs": "🐛",
    "Host Issues": "🛡️",
    "Other": "📋",
  };

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setShowProfile(!showProfile)} className="shrink-0 mt-0.5">
            <AvatarDisplay
              avatar={c.userAvatar}
              name={c.userName}
              className="w-10 h-10 rounded-xl ring-2 ring-border hover:ring-primary transition-all"
            />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm leading-tight">{c.userName}</p>
                {c.userHandle && <p className="text-xs text-muted-foreground">@{c.userHandle}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                {new Date(c.createdAt).toLocaleDateString("en-IN")}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${topicColor[c.subject] ?? topicColor["Other"]}`}>
                <span>{topicIcon[c.subject] ?? "📋"}</span>
                {c.subject}
              </span>
              {c.hostHandle && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-full px-2.5 py-1 font-medium">
                  🛡️ @{c.hostHandle}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">{c.description}</p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {c.imageUrl && (
                <button
                  onClick={() => setExpandedImage(!expandedImage)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {expandedImage ? "Hide" : "View"} Screenshot
                  {expandedImage ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                {showProfile ? "Hide" : "View"} Profile
                {showProfile ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {expandedImage && c.imageUrl && (
          <div className="mt-3">
            <img
              src={c.imageUrl}
              alt="Complaint screenshot"
              className="w-full rounded-xl max-h-64 object-contain border border-border bg-black/40"
            />
          </div>
        )}
      </div>

      {showProfile && (
        <div className="border-t border-border bg-secondary/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">User Profile</p>
          <div className="flex items-center gap-3 mb-3">
            <AvatarDisplay avatar={c.userAvatar} name={c.userName} className="w-14 h-14 rounded-2xl" />
            <div>
              <p className="font-bold">{c.userName}</p>
              {c.userHandle && <p className="text-sm text-muted-foreground">@{c.userHandle}</p>}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block capitalize ${
                c.userRole === "host" ? "bg-yellow-500/15 text-yellow-400"
                : c.userRole === "admin" ? "bg-primary/15 text-primary"
                : "bg-green-500/15 text-green-400"
              }`}>
                {c.userRole}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border border-border rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-green-400 mb-1"><Wallet className="w-3.5 h-3.5" /></div>
              <p className="font-bold text-sm"><GoldCoin amount={Number(c.userWallet ?? 0).toFixed(0)} /></p>
              <p className="text-xs text-muted-foreground">Wallet</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-blue-400 mb-1"><Swords className="w-3.5 h-3.5" /></div>
              <p className="font-bold text-sm">{c.userMatchCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Matches</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1"><Mail className="w-3.5 h-3.5" /></div>
              <p className="font-bold text-xs truncate">{c.userEmail?.split("@")[0]}</p>
              <p className="text-xs text-muted-foreground">Email</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const { data: complaints, isLoading } = useAdminListComplaints();
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openEdit = () => {
    setEditName(user?.name || "");
    setEditHandle(user?.handle || "");
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editName.trim() && !editHandle.trim()) return;
    setIsSaving(true);
    try {
      await customFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() || undefined, handle: editHandle.trim() || undefined }),
      });
      await refreshUser();
      toast({ title: "Profile updated!" });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to update", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout title="Profile">
      <div className="space-y-5 pb-4">
        {/* Admin info card */}
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <AvatarDisplay
                avatar={user?.avatar}
                name={user?.name}
                className="w-16 h-16 rounded-2xl"
              />
              <div>
                <h2 className="text-lg font-bold">{user?.name || "Admin"}</h2>
                <p className="text-sm text-muted-foreground">@{user?.handle || user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">Administrator</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={openEdit}>
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <Label>Display Name</Label>
                      <Input
                        placeholder="Your name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Handle</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                        <Input
                          placeholder="yourhandle"
                          value={editHandle}
                          onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, ""))}
                          className="pl-7"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Lowercase letters, numbers and underscores only</p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleSave}
                      disabled={isSaving || (!editName.trim() && !editHandle.trim())}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={logout}
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-destructive">{(complaints as any[])?.length ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Complaints</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-primary">{user?.email?.split("@")[0] ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Admin ID</p>
            </div>
          </div>
        </div>

        {/* Platform Wallet */}
        <PlatformWalletSection />

        {/* Complaints */}
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-destructive" />
          <h3 className="font-semibold text-sm">User Complaints</h3>
          {!isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">{(complaints as any[])?.length ?? 0} total</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : (complaints as any[])?.length ? (
          (complaints as any[]).map((c) => (
            <ComplaintCard key={c.id} c={c} />
          ))
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold">No complaints</h3>
            <p className="text-muted-foreground text-sm mt-1">All clear!</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
