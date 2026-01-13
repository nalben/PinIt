import React from 'react';
import classes from './LogoutButton.module.scss'

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
    </button>
  );
};

export default LogoutButton;
