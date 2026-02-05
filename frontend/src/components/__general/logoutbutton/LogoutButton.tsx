import React from 'react';
import classes from './LogoutButton.module.scss'
import Arrow from '@/assets/icons/monochrome/back.svg'
import { useAuthStore } from '@/store/authStore';

const LogoutButton: React.FC = () => {
  const logout = useAuthStore(state => state.logout);

  const handleLogout = () => {
    logout();
    window.location.href = '/welcome';
  };

  return (
    <button onClick={handleLogout} className={classes.button}>
      Logout
      <Arrow/>
    </button>
  );
};

export default LogoutButton;
