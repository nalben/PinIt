import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import axiosInstance from "@/../axiosInstance";

interface User {
  id: number;
  username: string;
  avatar?: string | null;
  email?: string | null;
}

const AppInit: React.FC = () => {
  const login = useAuthStore(state => state.login);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          logout();
          return;
        }

        const res = await axiosInstance.get<User>("/api/profile/me");
        const user = res.data;

        if (user && user.id > 0) {
          login(user);
        } else {
          logout();
        }
      } catch {
        logout();
      }
    };

    fetchUser();
  }, [login, logout]);

  return null;
};

export default AppInit;
