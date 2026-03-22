import { useEffect, useState, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken, setToken, clearToken } from "@/lib/auth";
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout } from "@workspace/api-client-react";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<import("@workspace/api-client-react").User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setAuthTokenGetter(getToken);
    if (token) {
      getMe()
        .then((u) => setUser(u))
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
    return res.user;
  };

  const register = async (email: string, password: string) => {
    const res = await apiRegister({ email, password });
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
  };

  const refreshUser = async () => {
    const u = await getMe();
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
