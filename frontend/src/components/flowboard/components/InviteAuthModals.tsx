import React from 'react';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import LoginForm from '@/components/auth/login/Login';
import RegisterForm from '@/components/auth/register/Register';
import ResetPasswordForm from '@/components/auth/reset/ResetPasswordForm';

export type InviteAuthView = 'login' | 'register' | 'reset';

export const InviteAuthModals: React.FC<{
  isOpen: boolean;
  view: InviteAuthView;
  hintClassName: string;
  onAbort: () => void;
  onSuccess: () => void;
  onOpenView: (next: InviteAuthView) => void;
}> = ({ isOpen, view, hintClassName, onAbort, onSuccess, onOpenView }) => {
  const hint = <div className={hintClassName}>Войдите в аккаунт, чтобы присоединиться к доске</div>;

  return (
    <>
      <AuthModal isOpen={isOpen && view === 'login'} onClose={onAbort} closeOnOverlayClick={false}>
        {hint}
        <LoginForm
          onOpenReset={() => onOpenView('reset')}
          onOpenRegister={() => onOpenView('register')}
          onClose={onSuccess}
        />
      </AuthModal>

      <AuthModal isOpen={isOpen && view === 'register'} onClose={onAbort} closeOnOverlayClick={false}>
        {hint}
        <RegisterForm onClose={onSuccess} />
      </AuthModal>

      <AuthModal
        isOpen={isOpen && view === 'reset'}
        onClose={onAbort}
        closeOnOverlayClick={false}
        onBack={() => onOpenView('login')}
      >
        {hint}
        <ResetPasswordForm onClose={onSuccess} />
      </AuthModal>
    </>
  );
};
