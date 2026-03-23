import { ReactNode, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Plus, ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { BottomNav } from "./BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetWallet, useGetNotifications } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  headerContent?: ReactNode;
  showBack?: boolean;
  backHref?: string;
  hideNav?: boolean;
}

const PULL_THRESHOLD = 70;

export function AppLayout({
  children,
  title,
  headerContent,
  showBack,
  backHref,
  hideNav,
}: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

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

  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPullDistance(0);
    await queryClient.refetchQueries();
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = mainRef.current?.scrollTop ?? 0;
    if (scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = null;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || isRefreshing) return;
    const scrollTop = mainRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) { touchStartY.current = null; return; }
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, PULL_THRESHOLD + 20));
    }
  }, [isRefreshing]);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      triggerRefresh();
    } else {
      setPullDistance(0);
    }
    touchStartY.current = null;
  }, [pullDistance, triggerRefresh]);

  const showIndicator = pullDistance > 0 || isRefreshing;
  const indicatorHeight = isRefreshing ? 44 : pullDistance;
  const spinnerReady = pullDistance >= PULL_THRESHOLD || isRefreshing;

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
              </div>
            </Link>
          )}

          {headerContent ? (
            <div className="flex-1 min-w-0">{headerContent}</div>
          ) : title && showBack ? (
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

      <div
        className="flex-1 overflow-y-auto relative"
        ref={mainRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {showIndicator && (
          <div
            className="flex items-center justify-center overflow-hidden transition-all duration-200"
            style={{ height: indicatorHeight }}
          >
            <RefreshCw
              className={cn(
                "w-5 h-5 text-primary transition-transform",
                (isRefreshing || spinnerReady) && "animate-spin"
              )}
              style={!isRefreshing ? { transform: `rotate(${(pullDistance / PULL_THRESHOLD) * 360}deg)` } : undefined}
            />
          </div>
        )}

        <main
          className={cn(
            "max-w-lg mx-auto w-full px-4 pt-4",
            !hideNav && "pb-24",
          )}
        >
          {children}
        </main>
      </div>

      {!hideNav && <BottomNav />}
    </div>
  );
}
