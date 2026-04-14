import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Plus, ArrowLeft, LogOut, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { BottomNav } from "./BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetWallet, useGetNotifications, useGetConversations } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { GoldCoinIcon, SilverCoinIcon } from "@/components/ui/Coins";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/contexts/SocketContext";
import { useToast } from "@/hooks/use-toast";
import { OnboardingTour } from "@/components/OnboardingTour";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  headerContent?: ReactNode;
  showBack?: boolean;
  backHref?: string;
  hideNav?: boolean;
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
  const isHomePage = location === "/";
  const queryClient = useQueryClient();
  const socket = useSocket();
  const { toast } = useToast();
  const [bellPulse, setBellPulse] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const onMatchNew = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    };
    const onMatchDeleted = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    };
    const onUserUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    };
    const onNotificationNew = (data: { type: string; message: string; url?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
      setBellPulse(true);
      setTimeout(() => setBellPulse(false), 2000);

      const emoji =
        data.type === "match_live" ? "🔴" :
        data.type === "match_reminder" ? "⏰" :
        data.type === "match_result" ? "🏆" :
        data.type === "room_ready" ? "🔑" :
        data.type === "match_join" ? "🎮" :
        data.type === "host_match_new" ? "🎮" :
        data.type === "new_follower" ? "👤" :
        data.type?.includes("wallet") || data.type?.includes("balance") ? "💰" :
        data.type?.includes("squad") ? "🤝" : "🔔";

      toast({
        title: `${emoji} ${data.message}`,
        duration: 4000,
      });
    };
    const onLegacyNotification = () => {
      queryClient.invalidateQueries({ queryKey: ["getNotifications"] });
    };

    socket.on("match:new", onMatchNew);
    socket.on("match:deleted", onMatchDeleted);
    socket.on("user:updated", onUserUpdated);
    socket.on("notification:new", onNotificationNew);
    socket.on("notification", onLegacyNotification);

    return () => {
      socket.off("match:new", onMatchNew);
      socket.off("match:deleted", onMatchDeleted);
      socket.off("user:updated", onUserUpdated);
      socket.off("notification:new", onNotificationNew);
      socket.off("notification", onLegacyNotification);
    };
  }, [socket, queryClient, toast]);

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  const { data: wallet } = useGetWallet({
    query: { enabled: !!user && user.role !== "admin" } as any,
  });
  const { data: notifications } = useGetNotifications({
    query: { enabled: !!user } as any,
  });
  const { data: conversations } = useGetConversations({
    query: { enabled: !!user && user.role !== "admin", refetchInterval: 10000 } as any,
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const unreadChats = conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {true && (
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
                  <button className="flex items-center gap-2 bg-secondary px-2.5 py-1 rounded-full text-sm font-semibold hover:bg-secondary/80 transition-colors">
                    <span className="flex items-center gap-0.5">
                      <GoldCoinIcon size="sm" />
                      <span>{wallet.balance.toFixed(0)}</span>
                    </span>
                    {user.role === "player" && wallet.silverCoins > 0 && (
                      <span className="flex items-center gap-0.5 border-l border-border pl-2">
                        <SilverCoinIcon size="sm" />
                        <span className="text-slate-300">{wallet.silverCoins}</span>
                      </span>
                    )}
                  </button>
                </Link>
              )}

              {user && user.role !== "admin" && (
                <Link href="/chat">
                  <button className="relative p-2 rounded-full hover:bg-secondary transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    {unreadChats > 0 && (
                      <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive border-0">
                        {unreadChats > 9 ? "9+" : unreadChats}
                      </Badge>
                    )}
                  </button>
                </Link>
              )}

              {user && (
                <Link href="/notifications">
                  <button className="relative p-2 rounded-full hover:bg-secondary transition-colors">
                    <Bell className={cn("w-5 h-5 transition-all", bellPulse && "text-primary animate-bounce")} />
                    {unreadCount > 0 && (
                      <Badge className={cn("absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive border-0", bellPulse && "animate-ping-once")}>
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                    {bellPulse && unreadCount === 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
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
      )}

      <div className="flex-1 overflow-y-auto relative">
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
      {user?.role === "player" && <OnboardingTour />}
    </div>
  );
}
