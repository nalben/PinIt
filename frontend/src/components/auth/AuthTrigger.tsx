import React, { useState } from "react";
import AuthModal from "./authmodal/AuthModal";
import LoginForm from "./login/Login";
import RegisterForm from "./register/Register";
import ResetPasswordForm from "./reset/ResetPasswordForm";

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
  const [isResetOpen, setIsResetOpen] = useState(false);

  return (
    <>
      <span onClick={() => setIsOpen(true)}>{children}</span>

      <AuthModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        closeOnOverlayClick={closeOnOverlayClick}
      >
        {type === "login" ? (
          <LoginForm
            onOpenReset={() => {
              setIsOpen(false);
              setIsResetOpen(true);
            }}
          />
        ) : (
          <RegisterForm />
        )}
      </AuthModal>

      <AuthModal
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        closeOnOverlayClick={false}
      >
        <ResetPasswordForm onClose={() => setIsResetOpen(false)} />
      </AuthModal>
    </>
  );
};

export default AuthTrigger;
