import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Wallet, Zap, Plus, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "./BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetWallet, useGetNotifications } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backHref?: string;
  hideNav?: boolean;
}

export function AppLayout({
  children,
  title,
  showBack,
  backHref,
  hideNav,
}: AppLayoutProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: wallet } = useGetWallet({
    query: { enabled: !!user && user.role !== "admin" },
  });
  const { data: notifications } = useGetNotifications({
    query: { enabled: !!user },
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

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
                <Zap className="w-5 h-5 text-primary fill-primary" />
                <span className="font-bold text-base tracking-tight text-foreground">
                  TournaX
                </span>
              </div>
            </Link>
          )}

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
