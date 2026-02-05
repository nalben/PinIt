import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

interface Props {
  children: JSX.Element;
}

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);

  if (!isInitialized) return <div>Checking access...</div>;
  if (!isAuth) return <Navigate to="/welcome" replace />;

  return children;
};

export default ProtectedRoute;
