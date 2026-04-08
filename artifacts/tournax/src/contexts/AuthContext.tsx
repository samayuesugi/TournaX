import { useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter, customFetch } from "@workspace/api-client-react";
import { getToken, setToken, clearToken } from "@/lib/auth";
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout } from "@workspace/api-client-react";
import { AuthContext, type DailyBonus } from "./auth-context";

async function callDailyCheckin(): Promise<DailyBonus | null> {
  try {
    const result = await customFetch<{ claimed: boolean; bonus: number; silverCoins: number }>(
      "/api/auth/daily-checkin",
      { method: "POST" }
    );
    if (result.claimed && result.bonus > 0) {
      return { bonus: result.bonus, silverCoins: result.silverCoins };
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<import("@workspace/api-client-react").User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDailyBonus, setPendingDailyBonus] = useState<DailyBonus | null>(null);

  useEffect(() => {
    setAuthTokenGetter(getToken);
    if (token) {
      getMe()
        .then(async (u) => {
          setUser(u);
          const bonus = await callDailyCheckin();
          if (bonus) setPendingDailyBonus(bonus);
        })
        .catch(() => {
          clearToken();
          setTokenState(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setToken(res.token);
    setTokenState(res.token);
    setAuthTokenGetter(getToken);
    setUser(res.user);
    if ((res as any).dailyLoginBonus > 0) {
      setPendingDailyBonus({
        bonus: (res as any).dailyLoginBonus,
        silverCoins: res.user.silverCoins ?? 0,
      });
    }
    return res;
  };

  const register = async (email: string, password: string, referralCode?: string) => {
    const res = await apiRegister({ email, password, ...(referralCode?.trim() ? { referralCode: referralCode.trim() } : {}) });
    setToken(res.token);
    setTokenState(res.token);
    setAuthTokenGetter(getToken);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try { await apiLogout(); } catch {}
    clearToken();
    setTokenState(null);
    setUser(null);
    setPendingDailyBonus(null);
    queryClient.clear();
  };

  const refreshUser = async () => {
    const u = await getMe();
    setUser(u);
  };

  const dismissDailyBonus = () => setPendingDailyBonus(null);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, pendingDailyBonus, dismissDailyBonus, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
