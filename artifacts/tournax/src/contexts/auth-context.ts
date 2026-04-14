import { createContext } from "react";
import type { User } from "@workspace/api-client-react";

export interface DailyBonus {
  bonus: number;
}

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  pendingDailyBonus: DailyBonus | null;
  dismissDailyBonus: () => void;
  login: (email: string, password: string) => Promise<{ user: User; token: string; [key: string]: any }>;
  register: (email: string, password: string, referralCode?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
