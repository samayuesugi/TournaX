import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/useAuth";
import { SocketProvider } from "@/contexts/SocketContext";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";

import AuthPage from "@/pages/auth";
import AuthCallbackPage from "@/pages/auth-callback";
import SetupProfilePage from "@/pages/setup-profile";
import HomePage from "@/pages/home";
import MatchDetailPage from "@/pages/match-detail";
import MyMatchesPage from "@/pages/my-matches";
import ProfilePage from "@/pages/profile";
import WalletPage from "@/pages/wallet";
import ExplorePage from "@/pages/explore";
import NotificationsPage from "@/pages/notifications";
import CreateMatchPage from "@/pages/host/create-match";
import HostDashboardPage from "@/pages/host/dashboard";
import AdminDashboardPage from "@/pages/admin/index";
import AdminPlayersPage from "@/pages/admin/players";
import AdminFinancePage from "@/pages/admin/finance";
import AdminComplaintsPage from "@/pages/admin/complaints";
import AdminProfilePage from "@/pages/admin/profile";
import AdminGamesPage from "@/pages/admin/games";
import AdminWalletPage from "@/pages/admin/wallet";
import ChatListPage from "@/pages/chat/index";
import ConversationPage from "@/pages/chat/conversation";
import GroupChatPage from "@/pages/chat/group";
import LeaderboardPage from "@/pages/leaderboard";
import AdminEarningsPage from "@/pages/admin/earnings";
import StorePage from "@/pages/store";
import SettingsPage from "@/pages/settings";
import CoachPage from "@/pages/coach";
import ClansPage from "@/pages/clans";
import NotFound from "@/pages/not-found";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { DailyBonusDialog } from "@/components/DailyBonusDialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { LanguageProvider } from "@/contexts/LanguageContext";

setAuthTokenGetter(getToken);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  },
});

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (!user.profileSetup && location !== "/setup-profile") {
    return <Redirect to="/setup-profile" />;
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === "admin") return <Redirect to="/admin" />;
    if (user.role === "host") return <Redirect to="/host" />;
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    if (!user.profileSetup) return <Redirect to="/setup-profile" />;
    if (user.role === "admin") return <Redirect to="/admin" />;
    if (user.role === "host") return <Redirect to="/host" />;
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth">
        <GuestRoute><AuthPage /></GuestRoute>
      </Route>

      <Route path="/auth/callback">
        <AuthCallbackPage />
      </Route>

      <Route path="/setup-profile">
        <SetupProfilePage />
      </Route>

      <Route path="/">
        <ProtectedRoute roles={["player", "host"]}>
          <HomePage />
        </ProtectedRoute>
      </Route>

      <Route path="/host">
        <ProtectedRoute roles={["host"]}>
          <HostDashboardPage />
        </ProtectedRoute>
      </Route>

      <Route path="/matches/:id">
        <ProtectedRoute><MatchDetailPage /></ProtectedRoute>
      </Route>

      <Route path="/my-matches">
        <ProtectedRoute roles={["player", "host"]}>
          <MyMatchesPage />
        </ProtectedRoute>
      </Route>

      <Route path="/profile">
        <ProtectedRoute><ProfilePage /></ProtectedRoute>
      </Route>

      <Route path="/profile/:handle">
        <ProtectedRoute><ProfilePage /></ProtectedRoute>
      </Route>

      <Route path="/settings">
        <ProtectedRoute><SettingsPage /></ProtectedRoute>
      </Route>

      <Route path="/wallet">
        <ProtectedRoute roles={["player", "host"]}>
          <WalletPage />
        </ProtectedRoute>
      </Route>

      <Route path="/explore">
        <ProtectedRoute roles={["player", "host"]}>
          <ExplorePage />
        </ProtectedRoute>
      </Route>

      <Route path="/coach">
        <ProtectedRoute roles={["player", "host"]}>
          <CoachPage />
        </ProtectedRoute>
      </Route>

      <Route path="/clans">
        <ProtectedRoute roles={["player", "host"]}>
          <ClansPage />
        </ProtectedRoute>
      </Route>

      <Route path="/store">
        <ProtectedRoute roles={["player", "host"]}><StorePage /></ProtectedRoute>
      </Route>

      <Route path="/notifications">
        <ProtectedRoute><NotificationsPage /></ProtectedRoute>
      </Route>

      <Route path="/host/create-match">
        <ProtectedRoute roles={["host"]}>
          <CreateMatchPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin">
        <ProtectedRoute roles={["admin"]}>
          <AdminDashboardPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/players">
        <ProtectedRoute roles={["admin"]}>
          <AdminPlayersPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/finance">
        <ProtectedRoute roles={["admin"]}>
          <AdminFinancePage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/games">
        <ProtectedRoute roles={["admin"]}>
          <AdminGamesPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/wallet">
        <ProtectedRoute roles={["admin"]}>
          <AdminWalletPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/earnings">
        <ProtectedRoute roles={["admin"]}>
          <AdminEarningsPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/complaints">
        <ProtectedRoute roles={["admin"]}>
          <AdminComplaintsPage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/profile">
        <ProtectedRoute roles={["admin"]}>
          <AdminProfilePage />
        </ProtectedRoute>
      </Route>

      <Route path="/chat">
        <ProtectedRoute>
          <ChatListPage />
        </ProtectedRoute>
      </Route>

      <Route path="/chat/group/:groupId">
        <ProtectedRoute>
          <GroupChatPage />
        </ProtectedRoute>
      </Route>

      <Route path="/chat/:userId">
        <ProtectedRoute>
          <ConversationPage />
        </ProtectedRoute>
      </Route>

      <Route path="/leaderboard">
        <ProtectedRoute roles={["player", "host"]}>
          <LeaderboardPage />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { pendingDailyBonus, dismissDailyBonus, user } = useAuth();
  usePushNotifications(!!user);
  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      {pendingDailyBonus && user?.role !== "admin" && user?.role !== "host" && (
        <DailyBonusDialog
          open={true}
          onClose={dismissDailyBonus}
          bonus={pendingDailyBonus.bonus}
          silverCoins={pendingDailyBonus.silverCoins}
        />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <AuthProvider>
            <SocketProvider>
              <AppContent />
            </SocketProvider>
          </AuthProvider>
          <Toaster />
          <PwaInstallBanner />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
