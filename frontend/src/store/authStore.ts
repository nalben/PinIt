import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';

interface User {
  id: number;
  username: string;
  avatar?: string | null;
  email?: string;
}

interface BootstrapUser extends User {
  token?: string | null;
}


interface AuthState {
  isAuth: boolean;
  hasToken: boolean;
  user: User | null;
  isInitialized: boolean;
  login: (user: User) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>(set => ({
  isAuth: false,
  hasToken: Boolean(localStorage.getItem("token")),
  user: null,
  isInitialized: false,
  login: user => {
    localStorage.setItem("userId", String(user.id));
    localStorage.setItem("username", user.username);
    set({ isAuth: true, hasToken: true, user, isInitialized: true });
  },
  logout: () => {
    void axiosInstance.post("/api/auth/logout").catch(() => {});
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    set({ isAuth: false, hasToken: false, user: null, isInitialized: true });
  },
  bootstrap: async () => {
    try {
      const { data } = await axiosInstance.get<BootstrapUser>("/api/profile/me");

      if (data && data.id > 0 && data.username) {
        const nextToken = typeof data.token === "string" && data.token.trim() ? data.token : localStorage.getItem("token");
        if (nextToken) {
          localStorage.setItem("token", nextToken);
        }
        localStorage.setItem("userId", String(data.id));
        localStorage.setItem("username", data.username);
        set({ isAuth: true, hasToken: Boolean(nextToken), user: data, isInitialized: true });
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        set({ isAuth: false, hasToken: false, user: null, isInitialized: true });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        set({ isAuth: false, hasToken: false, user: null, isInitialized: true });
        return;
      }

      set((s) => ({ ...s, hasToken: Boolean(localStorage.getItem("token")), isInitialized: true }));
    }
  },
}));
