import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

interface Props {
  children: JSX.Element;
}

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsValid(false);
      return;
    }

    // ===== выбираем адрес бэка =====
    const isLocal = window.location.hostname === "localhost";
    const baseURL = isLocal ? "http://localhost:3001" : "http://10.8.0.1:4000";

    fetch(`${baseURL}/api/private/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res.status === 401) {
          setIsValid(false);
        } else {
          setIsValid(true);
        }
      })
      .catch(() => setIsValid(false));
  }, []);

  if (isValid === null) return <div>Checking access...</div>;
  if (!isValid) return <Navigate to="/welcome" replace />;

  return children;
};

export default ProtectedRoute;
