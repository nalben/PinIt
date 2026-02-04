import React from "react";
import { useAuthStore } from "@/store/authStore";

interface Props {
  children: JSX.Element;
}

const GuestOnly: React.FC<Props> = ({ children }) => {
  const isAuth = useAuthStore(state => state.isAuth);

  if (isAuth) return null;

  return children;
};

export default GuestOnly;
