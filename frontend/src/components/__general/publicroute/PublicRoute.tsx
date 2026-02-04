import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

interface Props {
  children: JSX.Element;
}

const PublicRoute: React.FC<Props> = ({ children }) => {
  const isAuth = useAuthStore(state => state.isAuth);

  if (isAuth) return <Navigate to="/home" replace />;

  return children;
};

export default PublicRoute;
