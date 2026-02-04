import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import axios from "axios";
import { API_URL } from "@/../axiosInstance";

interface User {
  id: number;
  username: string;
  avatar?: string | null;
  email?: string | null;
}

const AppInit: React.FC = () => {
  const login = useAuthStore(state => state.login);

  useEffect(() => {
    const storedId = localStorage.getItem("userId");
    if (!storedId) return;

    const fetchUser = async () => {
      try {
        const res = await axios.get<User>(`${API_URL}/api/users/${storedId}`);
        const user = res.data;

        if (user && user.id > 0) { // ✅ id должен быть больше 0
          login(user);
        } else {
          localStorage.removeItem("userId");
        }
      } catch {
        localStorage.removeItem("userId");
      }
    };

    fetchUser();
  }, [login]);

  return null;
};

export default AppInit;
