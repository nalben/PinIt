import React from 'react';
import classes from './LogoutButton.module.scss'
import Arrow from '@/assets/icons/monochrome/back.svg'

const LogoutButton: React.FC = () => {
  const handleLogout = () => {
    localStorage.removeItem('token',);
    localStorage.removeItem('username',);
    localStorage.removeItem('userId',);
    window.location.reload();
  };

  return (
    <button onClick={handleLogout} className={classes.button}>
      Logout
      <Arrow/>
    </button>
  );
};

export default LogoutButton;
