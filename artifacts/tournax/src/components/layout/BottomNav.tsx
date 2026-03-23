import { useLocation, Link } from "wouter";
import { Home, Compass, LayoutDashboard, Plus, DollarSign, MessageCircle, Swords, User, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { useGetConversations } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const playerNav = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/my-matches", icon: Swords, label: "Matches" },
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/profile", icon: User, label: "Profile" },
];

const hostNav = [
  { href: "/host", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/host/create-match", icon: Plus, label: "Create" },
  { href: "/my-matches", icon: Swords, label: "Matches" },
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/profile", icon: User, label: "Profile" },
];

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/players", icon: User, label: "Players" },
  { href: "/admin/finance", icon: DollarSign, label: "Finance" },
  { href: "/admin/wallet", icon: Wallet, label: "Wallet" },
  { href: "/admin/complaints", icon: Swords, label: "Issues" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: conversations } = useGetConversations({ query: { refetchInterval: 10000 } });

  const totalUnread = conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
  const nav = user?.role === "admin" ? adminNav : user?.role === "host" ? hostNav : playerNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {nav.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          const isChat = href === "/chat";
          return (
            <Link key={href} href={href}>
              <button
                className={cn(
                  "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                  {isChat && totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-[9px] text-white flex items-center justify-center font-bold">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
