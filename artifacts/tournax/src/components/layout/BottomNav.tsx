import { useLocation, Link } from "wouter";
import { Home, Compass, LayoutDashboard, Plus, DollarSign, User, Swords, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useGetConversations } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const EXACT_MATCH_HREFS = new Set(["/", "/admin", "/host"]);

function isNavActive(href: string, location: string): boolean {
  if (EXACT_MATCH_HREFS.has(href)) return location === href;
  return location === href || location.startsWith(href + "/");
}

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();

  const { data: conversations } = useGetConversations({
    query: { enabled: user?.role === "player", refetchInterval: 10000 } as any,
  });
  const unreadChats = conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

  const playerNav = [
    { href: "/", icon: Home, label: t("home") },
    { href: "/explore", icon: Compass, label: t("explore") },
    { href: "/my-matches", icon: Swords, label: t("matches") },
    { href: "/chat", icon: MessageCircle, label: "Chat", badge: unreadChats > 0 ? (unreadChats > 9 ? "9+" : String(unreadChats)) : undefined },
    { href: "/profile", icon: User, label: t("profile") },
  ];

  const hostNav = [
    { href: "/host", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/host/create-match", icon: Plus, label: t("create") },
    { href: "/explore", icon: Compass, label: t("explore") },
    { href: "/profile", icon: User, label: t("profile") },
  ];

  const adminNav = [
    { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/admin/players", icon: User, label: "Players" },
    { href: "/admin/finance", icon: DollarSign, label: "Finance" },
    { href: "/admin/profile", icon: User, label: t("profile") },
  ];

  const nav = user?.role === "admin" ? adminNav : user?.role === "host" ? hostNav : playerNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {nav.map(({ href, icon: Icon, label, badge }: any) => {
          const isActive = isNavActive(href, location);
          return (
            <Link key={href} href={href}>
              <button
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                  {badge && (
                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {badge}
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
