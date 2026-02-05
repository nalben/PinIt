import React from "react";
import { useAuthStore } from "@/store/authStore";

interface Props {
  children: JSX.Element;
}

const AuthOnly: React.FC<Props> = ({ children }) => {
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);

  if (!isInitialized) return null;
  if (!isAuth) return null;

  return children;
};

export default AuthOnly;
