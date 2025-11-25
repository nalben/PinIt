// src/components/auth/AuthTrigger.tsx
import React, { useState } from "react";
import AuthModal from "./authmodal/AuthModal";
import LoginForm from "./login/Login";
import RegisterForm from "./register/Register";

interface AuthTriggerProps {
  type: "login" | "register";
  children: React.ReactNode;
}

const AuthTrigger: React.FC<AuthTriggerProps> = ({ type, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <span onClick={() => setIsOpen(true)}>{children}</span>
      <AuthModal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {type === "login" ? (
          <LoginForm />
        ) : (
          <RegisterForm />
        )}
      </AuthModal>
    </>
  );
};

export default AuthTrigger;
