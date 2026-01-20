import React, { useState } from "react";
import AuthModal from "./authmodal/AuthModal";
import LoginForm from "./login/Login";
import RegisterForm from "./register/Register";
import ResetPasswordForm from "./reset/ResetPasswordForm";

export type AuthTriggerType = "login" | "register" | "reset";

interface AuthTriggerProps {
  type: AuthTriggerType;
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
}

const AuthTrigger: React.FC<AuthTriggerProps> = ({
  type,
  children,
  closeOnOverlayClick = true,
}) => {
  const [current, setCurrent] = useState<AuthTriggerType | null>(null);

  const open = (t: AuthTriggerType) => setCurrent(t);
  const close = () => setCurrent(null);

  return (
    <>
      <span onClick={() => open(type)}>{children}</span>

      <AuthModal
        isOpen={current === "login"}
        onClose={close}
        closeOnOverlayClick={closeOnOverlayClick}
      >
        <LoginForm
          onOpenReset={() => open("reset")}
          onOpenRegister={() => open("register")}
          onClose={close}
        />
      </AuthModal>

      <AuthModal
        isOpen={current === "register"}
        onClose={close}
        closeOnOverlayClick={false}
      >
        <RegisterForm />
      </AuthModal>

      <AuthModal
        isOpen={current === "reset"}
        onClose={close}
        closeOnOverlayClick={false}
        onBack={() => open("login")}
      >
        <ResetPasswordForm onClose={close} />
      </AuthModal>
    </>
  );
};

export default AuthTrigger;
