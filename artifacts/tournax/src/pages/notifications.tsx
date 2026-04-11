import { useEffect, useState } from "react";
import { useGetNotifications } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Info, Trophy, AlertCircle, CheckCircle, Wallet, Trash2, Users, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AvatarDisplay } from "./profile";

function getIcon(type: string) {
  if (type === "squad_invite" || type === "squad_accepted") return <Users className="w-4 h-4" />;
  if (type === "match_live") return <span className="text-sm">🔴</span>;
  if (type === "room_ready") return <span className="text-sm">🚪</span>;
  if (type === "new_follower") return <span className="text-sm">👤</span>;
  if (type === "host_match_new") return <span className="text-sm">🎮</span>;
  if (type.includes("result") || type.includes("win")) return <Trophy className="w-4 h-4" />;
  if (type.includes("join")) return <Trophy className="w-4 h-4" />;
  if (type.includes("ban") || type.includes("reject")) return <AlertCircle className="w-4 h-4" />;
  if (type.includes("approve") || type.includes("approved")) return <CheckCircle className="w-4 h-4" />;
  if (type.includes("balance") || type.includes("wallet") || type.includes("withdraw")) return <Wallet className="w-4 h-4" />;
  return <Info className="w-4 h-4" />;
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SquadRequestCard({ request, onHandled }: { request: any; onHandled: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);

  const handle = async (action: "accept" | "reject") => {
    setLoading(action);
    try {
      await customFetch(`/api/users/me/squad-requests/${request.id}`, { method: "PUT", body: JSON.stringify({ action }) });
      toast({ title: action === "accept" ? "Squad invite accepted! You're now an Esports Player." : "Squad invite declined." });
      onHandled();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    } finally { setLoading(null); }
  };

  return (
    <div className="bg-card border border-primary/30 bg-primary/5 rounded-xl px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-primary/20 text-primary shrink-0 mt-0.5">
          <Users className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AvatarDisplay avatar={request.fromAvatar} className="w-7 h-7 rounded-lg text-sm" />
            <div>
              <span className="font-semibold text-sm">{request.fromName || `@${request.fromHandle}`}</span>
              <span className="text-xs text-muted-foreground ml-1">@{request.fromHandle}</span>
            </div>
          </div>
          <p className="text-sm text-foreground leading-snug mb-1">
            Invited you to join their <span className="text-primary font-semibold">{request.game}</span> squad
            {request.role && <> as <span className="text-primary font-semibold">{request.role}</span></>}
            {request.isBackup && <span className="text-orange-400 text-xs ml-1">(Backup)</span>}
          </p>
          <p className="text-xs text-muted-foreground">{timeAgo(request.createdAt)}</p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => handle("accept")} disabled={!!loading}>
              <Check className="w-3 h-3" /> {loading === "accept" ? "Joining..." : "Accept"}
            </Button>
            <Button size="sm" variant="secondary" className="h-7 px-3 text-xs gap-1" onClick={() => handle("reject")} disabled={!!loading}>
              <X className="w-3 h-3" /> {loading === "reject" ? "Declining..." : "Decline"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useGetNotifications();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: squadRequests, refetch: refetchRequests } = useQuery({
    queryKey: ["squadRequests"],
    queryFn: () => customFetch<any[]>("/api/users/me/squad-requests"),
  });

  useEffect(() => {
    const unread = notifications?.some((n) => !n.read);
    if (!unread) return;
    const timer = setTimeout(async () => {
      try {
        await customFetch("/api/notifications/read-all", { method: "POST" });
        queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
      } catch {}
    }, 1500);
    return () => clearTimeout(timer);
  }, [notifications, queryClient]);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const hasAny = (notifications?.length ?? 0) > 0 || (squadRequests?.length ?? 0) > 0;

  async function markAllRead() {
    try {
      await customFetch("/api/notifications/read-all", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
    } catch {}
  }

  async function clearAll() {
    try {
      await customFetch("/api/notifications/clear-all", { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
      toast({ title: "Notifications cleared" });
    } catch {}
  }

  return (
    <AppLayout showBack backHref="/" title="Notifications">
      <div className="space-y-2 pb-4">
        {hasAny && (
          <div className="flex justify-end gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-xs text-destructive h-7 px-2 gap-1" onClick={clearAll}>
              <Trash2 className="w-3 h-3" /> Clear all
            </Button>
          </div>
        )}

        {(squadRequests?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Squad Invites</p>
            {squadRequests!.map(req => (
              <SquadRequestCard key={req.id} request={req} onHandled={() => {
                refetchRequests();
                queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
              }} />
            ))}
          </div>
        )}

        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 bg-card border rounded-xl px-4 py-3 transition-all",
                n.read ? "border-card-border opacity-70" : "border-primary/30 bg-primary/5"
              )}
            >
              <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0", n.read ? "bg-secondary text-muted-foreground" : "bg-primary/20 text-primary")}>
                {getIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.read && (
                <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
              )}
            </div>
          ))
        ) : (squadRequests?.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold">All caught up!</h3>
            <p className="text-muted-foreground text-sm mt-1">No notifications yet</p>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
