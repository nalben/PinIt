import React, { useEffect, useRef, useState } from 'react';
import classes from './Header.module.scss';
import { NavLink } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Burger from '@/assets/icons/monochrome/burger.svg';
import axios from 'axios';
import { API_URL } from "@/../axiosInstance";
import AuthOnly from '@/components/__general/authonly/Authonly';
import GuestOnly from '@/components/__general/guestonly/Guestonly';
import AuthTrigger from '@/components/auth/AuthTrigger';

interface UserProfile {
  username: string;
  avatar?: string | null;
}

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement | null>(null);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? `${classes.item} ${classes.active}`
      : classes.item;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        burgerRef.current &&
        !burgerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await axios.get<UserProfile>(`${API_URL}/api/profile`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setUser(res.data);
    } catch (err) {
      console.error('Ошибка при получении профиля:', err);
    }
  };

  fetchProfile();
}, []);

  return (
    <header className={classes.container}>
      <div className={classes.burger_con}>
        <button
          ref={burgerRef}
          className={classes.burger}
          onClick={() => setMenuOpen(prev => !prev)}
        >
          <Burger />
        </button>
      </div>

      <nav
        ref={menuRef}
        className={`${classes.menu} ${menuOpen ? classes.active_menu : ''}`}
      >
        <NavLink to="/home" className={linkClass}>
          HOME
        </NavLink>
        <NavLink to="/spaces" className={linkClass}>
          SPACES
        </NavLink>
        <NavLink to="/todo" className={linkClass}>
          TO DO
        </NavLink>
        <NavLink to="/about" className={linkClass}>
          ABOUT
        </NavLink>
        <GuestOnly>
            <AuthTrigger
            type='login'
            >
                <div className={classes.item}>PROFILE</div>
            </AuthTrigger>
        </GuestOnly>
        <AuthOnly>
            <NavLink to="/profile" className={linkClass}>
            PROFILE
            </NavLink>
        </AuthOnly>
      </nav>

      <div>
        <AuthOnly>
            <div className={classes.user}>
                <div className={classes.noti}>
                <Noti />
                </div>
                <div className={classes.profile}>
                {user?.avatar ? (
                    <img src={user.avatar} alt="Аватар" className={classes.avatar} />
                ) : (
                    <Default />
                )}
                <span>
                    {user?.username || 'Загрузка...'}
                </span>
                </div>
            </div>
        </AuthOnly>
        <GuestOnly>
          <AuthTrigger type='login'>
            <div className={`${classes.user} ${classes.header_reg}`}>
              <span>
                Sign in
              </span>
            </div>
          </AuthTrigger>
        </GuestOnly>
      </div>
    </header>
  );
};

export default Header;
