import React from "react";
import { Navigate } from "react-router-dom";

interface Props {
  children: JSX.Element;
}

const PublicRoute: React.FC<Props> = ({ children }) => {
  const token = localStorage.getItem("token");
  if (token) return <Navigate to="/home" replace />;
  return children;
};

export default PublicRoute;
