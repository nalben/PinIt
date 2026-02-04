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
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  isAuth: false,
  user: null,
  login: user => set({ isAuth: true, user }),
  logout: () => set({ isAuth: false, user: null }),
}));


