import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';

interface User {
  id: number;
  username: string;
  avatar?: string | null;
  email?: string;
}


interface AuthState {
  isAuth: boolean;
  user: User | null;
  isInitialized: boolean;
  login: (user: User) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>(set => ({
  isAuth: false,
  user: null,
  isInitialized: false,
  login: user => {
    localStorage.setItem("userId", String(user.id));
    localStorage.setItem("username", user.username);
    set({ isAuth: true, user, isInitialized: true });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    set({ isAuth: false, user: null, isInitialized: true });
  },
  bootstrap: async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      set({ isAuth: false, user: null, isInitialized: true });
      return;
    }

    try {
      const { data } = await axiosInstance.get<User>("/api/profile/me");

      if (data && data.id > 0 && data.username) {
        localStorage.setItem("userId", String(data.id));
        localStorage.setItem("username", data.username);
        set({ isAuth: true, user: data, isInitialized: true });
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        set({ isAuth: false, user: null, isInitialized: true });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        set({ isAuth: false, user: null, isInitialized: true });
        return;
      }

      set((s) => ({ ...s, isInitialized: true }));
    }
  },
}));
