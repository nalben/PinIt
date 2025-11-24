import React, { useState } from 'react';
import AuthModal from './authmodal/AuthModal';
import LoginForm from './login/Login';
import RegisterForm from './register/Register';


interface AuthTriggerProps {
  type: 'login' | 'register';
  children: React.ReactNode;
}

const AuthTrigger: React.FC<AuthTriggerProps> = ({ type, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (username: string, password: string) => {
    console.log(type, username, password);
    setIsOpen(false);
    // Здесь можно вызывать API для логина или регистрации
  };

  return (
    <>
      <span onClick={() => setIsOpen(true)}>{children}</span>
      <AuthModal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {type === 'login' ? (
          <LoginForm onSubmit={handleSubmit} />
        ) : (
          <RegisterForm onSubmit={handleSubmit} />
        )}
      </AuthModal>
    </>
  );
};

export default AuthTrigger;
