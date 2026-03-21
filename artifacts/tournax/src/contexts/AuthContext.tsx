import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken, setToken, clearToken } from "@/lib/auth";
import type { User } from "@workspace/api-client-react";
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout } from "@workspace/api-client-react";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiLogin({ email, password });
    setToken(res.token);
    setTokenState(res.token);
    setAuthTokenGetter(getToken);
    setUser(res.user);
    return res.user;
  };

  const register = async (email: string, password: string): Promise<User> => {
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
