import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Plus, ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { BottomNav } from "./BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetWallet, useGetNotifications } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  headerContent?: ReactNode;
  showBack?: boolean;
  backHref?: string;
  hideNav?: boolean;
}

const SECTION_NAMES: Record<string, string> = {
  "/": "Home",
  "/explore": "Explore",
  "/chat": "Chat",
  "/wallet": "Wallet",
  "/notifications": "Notifications",
  "/my-matches": "My Matches",
  "/profile": "Profile",
  "/host": "Dashboard",
  "/host/create-match": "Create Match",
  "/admin": "Dashboard",
  "/admin/players": "Players",
  "/admin/finance": "Finance",
  "/admin/complaints": "Issues",
};

function getSectionName(path: string): string | null {
  if (SECTION_NAMES[path]) return SECTION_NAMES[path];
  if (path.startsWith("/profile/")) return "Profile";
  if (path.startsWith("/chat/")) return "Chat";
  return null;
}

export function AppLayout({
  children,
  title,
  headerContent,
  showBack,
  backHref,
  hideNav,
}: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  const { data: wallet } = useGetWallet({
    query: { enabled: !!user && user.role !== "admin" },
  });
  const { data: notifications } = useGetNotifications({
    query: { enabled: !!user },
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const sectionName = getSectionName(location);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 h-14 px-4 max-w-lg mx-auto">
          {showBack ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => (backHref ? navigate(backHref) : history.back())}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          ) : (
            <Link href={user?.role === "admin" ? "/admin" : user?.role === "host" ? "/host" : "/"}>
              <div className="flex items-center gap-1.5">
                <img
                  src={`${import.meta.env.BASE_URL}logo.png`}
                  alt="TournaX"
                  className="w-7 h-7 object-contain"
                />
                <span className="font-bold text-base tracking-tight text-foreground">
                  TournaX
                </span>
                {sectionName && (
                  <>
                    <span className="text-muted-foreground/50 text-sm font-normal">/</span>
                    <span className="text-sm font-medium text-muted-foreground">{sectionName}</span>
                  </>
                )}
              </div>
            </Link>
          )}

          {headerContent ? (
            <div className="flex-1 min-w-0">{headerContent}</div>
          ) : title ? (
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{title}</p>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {user && user.role !== "admin" && wallet && (
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 bg-secondary px-2.5 py-1 rounded-full text-sm font-semibold hover:bg-secondary/80 transition-colors">
                  <span className="text-accent">₹</span>
                  <span>{wallet.balance.toFixed(0)}</span>
                </button>
              </Link>
            )}

            {user && (
              <Link href="/notifications">
                <button className="relative p-2 rounded-full hover:bg-secondary transition-colors">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive border-0">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                </button>
              </Link>
            )}

            {user?.role === "host" && (
              <Link href="/host/create-match">
                <Button size="sm" className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  Create
                </Button>
              </Link>
            )}

            {user && (user.role === "admin" || user.role === "host") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "flex-1 max-w-lg mx-auto w-full px-4 pt-4",
          !hideNav && "pb-24",
        )}
      >
        {children}
      </main>

      {!hideNav && <BottomNav />}
    </div>
  );
}
