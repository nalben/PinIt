import React from 'react';
import classes from './HomeWelcome.module.scss';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { useAuthStore } from '@/store/authStore';

const HomeWelcome: React.FC = () => {
  const isAuth = useAuthStore(state => state.isAuth);

  return (
    <section className={classes.welcome_container}>
      <h1>Добро пожаловать в&nbsp;PinIt</h1>
      <h2>Создайте свою доску или присоединяйтесь к доскам своих друзей</h2>
      {isAuth ? (
        <Mainbtn
          variant='mini'
          text='Создать доску'
        />
      ) : (
        <AuthTrigger type='login'>
          <Mainbtn
            variant='mini'
            text='Создать доску'
          />
        </AuthTrigger>
      )}
    </section>
  );
};

export default HomeWelcome;
