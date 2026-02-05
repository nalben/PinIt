import { create } from 'zustand';

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
}));


