import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

interface Props {
  children: JSX.Element;
}

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const login = useAuthStore(state => state.login);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      logout();
      setIsValid(false);
      return;
    }

    const isLocal = window.location.hostname === "localhost";
    const baseURL = isLocal ? "http://localhost:3001" : "http://10.8.0.1:4000";

    fetch(`${baseURL}/api/private/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res.status === 401) {
          logout();
          setIsValid(false);
        } else {
          // Можно запросить данные пользователя и вызвать login, если нужно
          const userId = Number(localStorage.getItem("userId")) || null;
          const username = localStorage.getItem("username") || null;
          if (userId && username) login({ id: userId, username });
          setIsValid(true);
        }
      })
      .catch(() => {
        logout();
        setIsValid(false);
      });
  }, [login, logout]);

  if (isValid === null) return <div>Checking access...</div>;
  if (!isValid) return <Navigate to="/welcome" replace />;

  return children;
};

export default ProtectedRoute;
