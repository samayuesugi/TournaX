import { useEffect } from "react";
import { useGetNotifications } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Info, Trophy, AlertCircle, CheckCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

function getIcon(type: string) {
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

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useGetNotifications();
  const queryClient = useQueryClient();

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

  async function markAllRead() {
    try {
      await customFetch("/api/notifications/read-all", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
    } catch {}
  }

  return (
    <AppLayout showBack backHref="/" title="Notifications">
      <div className="space-y-2 pb-4">
        {unreadCount > 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2" onClick={markAllRead}>
              Mark all read
            </Button>
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
        ) : (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold">All caught up!</h3>
            <p className="text-muted-foreground text-sm mt-1">No notifications yet</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
