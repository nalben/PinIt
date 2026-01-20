import React, { useEffect, useRef, useState } from 'react';
import classes from './Header.module.scss';
import { NavLink, useLocation } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Burger from '@/assets/icons/monochrome/burger.svg';
import axios from 'axios';
import { API_URL } from "@/../axiosInstance";
import AuthOnly from '@/components/__general/authonly/Authonly';
import GuestOnly from '@/components/__general/guestonly/Guestonly';
import AuthTrigger from '@/components/auth/AuthTrigger';
import DropdownWrapper from '../dropdownwrapper/DropdownWrapper';
import LogoutButton from '@/components/__general/logoutbutton/LogoutButton';
import Arrow from '@/assets/icons/monochrome/back.svg'

interface UserProfile {
  username: string;
  avatar?: string | null;
  email?: string;
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
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await axios.get<UserProfile>(`${API_URL}/api/profile/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        setUser(res.data);
      } catch (err) {
        console.error('Ошибка при получении профиля:', err);
      }
    };

    fetchProfile();
  }, []);

  const location = useLocation();
  const isProfileActive = () => {
    if (location.pathname === '/profile') return true;
    if (user && location.pathname === `/user/${user.username}`) return true;
    return false;
  };

  const handleMenuItemClick = () => {
    setMenuOpen(false);
  };

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
        <NavLink to="/home" className={linkClass} onClick={handleMenuItemClick}>
          HOME
        </NavLink>
        <NavLink to="/spaces" className={linkClass} onClick={handleMenuItemClick}>
          SPACES
        </NavLink>
        <NavLink to="/todo" className={linkClass} onClick={handleMenuItemClick}>
          TO DO
        </NavLink>
        <NavLink to="/about" className={linkClass} onClick={handleMenuItemClick}>
          ABOUT
        </NavLink>
        <GuestOnly>
            <AuthTrigger type='login'>
                <div className={classes.item}>PROFILE</div>
            </AuthTrigger>
        </GuestOnly>
        <AuthOnly>
          <NavLink
            to="/profile"
            className={() =>
              isProfileActive()
                ? `${classes.item} ${classes.active}`
                : classes.item
            }
            onClick={handleMenuItemClick}
          >
            PROFILE
          </NavLink>
        </AuthOnly>
      </nav>

      <div>
        <AuthOnly>
            <div className={classes.user}>
                <div className={classes.noti}>
                  <DropdownWrapper right noti closeOnClick={false}>
                    <div className={classes.noti_icon_con}>
                      <Noti />
                    </div>
                    <div className={classes.noti_con}>
                      список уведомлений
                    </div>
                  </DropdownWrapper>
                </div>
                <DropdownWrapper right profile>
                  <div className={classes.profile}>
                    {user?.avatar ? (
                        <img src={user.avatar} alt="Аватар" className={classes.avatar} />
                    ) : (
                        <Default />
                    )}
                    <span className={classes.profile_header_top}>
                        {user?.username || 'Загрузка...'}
                    </span>
                  </div>
                  <div>
                    <NavLink to="/profile">
                      <div className={classes.profile_button}>
                        {user?.avatar ? (
                          <img src={user.avatar} alt="Аватар" className={classes.avatar} />
                            ) : (
                              <Default />
                        )}
                        <div className={classes.profile_name_drop_con}>
                          <span className={classes.name_drop}>
                            {user?.username || 'Загрузка...'}
                          </span>
                          <div className={classes.email_drop}>
                            <span className={classes.email_drop_item}>
                              {user?.email}
                            </span>
                            <Arrow/>
                          </div>
                        </div>
                      </div>
                    </NavLink>
                    <LogoutButton/>
                  </div>
                </DropdownWrapper>
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
