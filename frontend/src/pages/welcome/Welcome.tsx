import React, { useState } from 'react';
import classes from './Welcome.module.scss';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import ResetPasswordForm from '@/components/auth/reset/ResetPasswordForm';
import back from '@/assets/img/back.jpg';
import LoginForm from '@/components/auth/login/Login';
import RegisterForm from '@/components/auth/register/Register';
import AuthTrigger from '@/components/auth/AuthTrigger';

const Welcome = () => {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);

  return (
    <section className={classes.welcome}>
      <div
        className={classes.container}
        style={{
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          // backgroundImage: `url(${back})`,
        }}
      >
        <div className={classes.headline}>
          <h1>PinIt — Your Idea Board</h1>
          <h2>Sign in or create an account to start connecting your notes.</h2>
        </div>
        <div className={classes.buttons}>
          <Mainbtn
            text="login"
            type="button"
            variant="auth"
            onClick={() => setIsLoginOpen(true)}
          />
          <AuthTrigger
          type="register"
          closeOnOverlayClick={false}
          >
            <Mainbtn
              text="register"
              type="button"
              variant="auth"
            />
          </AuthTrigger>
          </div>
      </div>

      <AuthModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      >
        <LoginForm
          onOpenReset={() => {
            setIsLoginOpen(false);
            setIsResetOpen(true);
          }}
        />
      </AuthModal>

      <AuthModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      >
        <RegisterForm />
      </AuthModal>

      <AuthModal
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        closeOnOverlayClick={false}
        onBack={() => {
          setIsResetOpen(false);
          setIsLoginOpen(true);
        }}
      >
        <ResetPasswordForm onClose={() => setIsResetOpen(false)} />
      </AuthModal>
    </section>
  );
};

export default Welcome;
