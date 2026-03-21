import { useGetConversations } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function roleBadge(role: string) {
  if (role === "host") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">Host</span>;
  if (role === "admin") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">Admin</span>;
  return null;
}

export default function ChatListPage() {
  const { data: conversations, isLoading } = useGetConversations();

  return (
    <AppLayout title="Messages">
      <div className="space-y-2 pb-4">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : conversations && conversations.length > 0 ? (
          conversations.map((conv) => (
            <Link key={conv.userId} href={`/chat/${conv.userId}`}>
              <div
                className={cn(
                  "flex items-center gap-3 bg-card border rounded-xl px-4 py-3 hover:bg-secondary/30 transition-all cursor-pointer",
                  conv.unreadCount > 0 ? "border-primary/30" : "border-card-border"
                )}
              >
                <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">
                  {conv.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-sm truncate">{conv.name || conv.handle}</span>
                    {roleBadge(conv.role)}
                  </div>
                  <p className={cn(
                    "text-xs truncate",
                    conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {conv.lastMessage}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(conv.lastMessageAt)}</span>
                  {conv.unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-center py-16">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold">No conversations yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Start a chat from a player or host profile</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
