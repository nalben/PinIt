import React, { useState } from "react";
import AuthModal from "./authmodal/AuthModal";
import LoginForm from "./login/Login";
import RegisterForm from "./register/Register";

interface AuthTriggerProps {
  type: "login" | "register";
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
}

const AuthTrigger: React.FC<AuthTriggerProps> = ({
  type,
  children,
  closeOnOverlayClick = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <span onClick={() => setIsOpen(true)}>{children}</span>
      <AuthModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        closeOnOverlayClick={closeOnOverlayClick}
      >
        {type === "login" ? <LoginForm /> : <RegisterForm />}
      </AuthModal>
    </>
  );
};

export default AuthTrigger;
