import React, { createContext, useContext, useState } from "react";

export type AuthModalType = "login" | "register" | "reset" | null;

interface AuthContextValue {
  open: (type: AuthModalType) => void;
  close: () => void;
  current: AuthModalType;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuthModal = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthModal must be used inside AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [current, setCurrent] = useState<AuthModalType>(null);

  const open = (type: AuthModalType) => setCurrent(type);
  const close = () => setCurrent(null);

  return (
    <AuthContext.Provider value={{ open, close, current }}>
      {children}
    </AuthContext.Provider>
  );
};
