import React, { useEffect, useRef, useState } from 'react';
import classes from './Header.module.scss';
import { NavLink, useLocation } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Burger from '@/assets/icons/monochrome/burger.svg';
import axiosInstance, { API_URL } from "@/api/axiosInstance";
import AuthTrigger from '@/components/auth/AuthTrigger';
import DropdownWrapper from '../dropdownwrapper/DropdownWrapper';
import LogoutButton from '@/components/__general/logoutbutton/LogoutButton';
import Arrow from '@/assets/icons/monochrome/back.svg'
import Accept from '@/assets/icons/monochrome/accept.svg'
import Deny from '@/assets/icons/monochrome/deny.svg'
import { useAuthStore } from '@/store/authStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useUIStore } from '@/store/uiStore';

interface UserProfile {
  id: number;
  username: string;
  avatar?: string | null;
  email?: string;
}
interface FriendRequestNoti {
  id: number;
  user_id: number;
  username: string;
  nickname?: string;
  avatar?: string | null;
  created_at: string;
}

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, login } = useAuthStore();
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);
  const menuRef = useRef<HTMLElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement | null>(null);
  const [notiOpen, setNotiOpen] = useState(false);
  const [isAvatarLoaded, setIsAvatarLoaded] = useState(false);
  const { requests, fetchRequests, acceptRequest, rejectRequest, highlightRequestId, setHighlightRequestId } = useNotificationsStore();
  const requestsCount = requests.length;
  const {
    headerDropdown,
    toggleHeaderDropdown,
    closeHeaderDropdown
  } = useUIStore();

  const isProfileOpen = headerDropdown === 'profile';
  const isNotiOpen = headerDropdown === 'notifications';
  const isProfileLoading = !isInitialized;
  const showAvatarSkeleton = isProfileLoading || (!!user?.avatar && !isAvatarLoaded);
    
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
  if (!isInitialized) return;
  if (!isAuth) return;
  if (requestsCount > 0) return;
  fetchRequests();
}, [fetchRequests, isAuth, isInitialized, requestsCount]);

  useEffect(() => {
    if (!isNotiOpen || !highlightRequestId) return;
    const el = document.getElementById(`noti-${highlightRequestId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightRequestId(null), 600);
    }
  }, [isNotiOpen, highlightRequestId, setHighlightRequestId, requests]);

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
  const updateProfile = async () => {
    try {
      const { data } = await axiosInstance.get<UserProfile>('/api/profile/me');
      login({
        id: data.id,
        username: data.username,
        avatar: data.avatar,
        email: data.email
      });
    } catch (e) {
      console.error(e);
    }
  };

  window.addEventListener('profile-updated', updateProfile);

  return () => {
    window.removeEventListener('profile-updated', updateProfile);
  };
}, [login]);

  useEffect(() => {
    setIsAvatarLoaded(false);
  }, [user?.avatar]);

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
          TODO
        </NavLink>
        {!isInitialized ? (
          <div className={classes.item}>PROFILE</div>
        ) : isAuth ? (
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
        ) : (
          <AuthTrigger type='login'>
            <div className={classes.item}>PROFILE</div>
          </AuthTrigger>
        )}
      </nav>

      <div className={classes.profile_container}>
        {!isInitialized ? (
          <div className={classes.user} aria-busy="true">
            <div className={classes.profile}>
              <div className={`${classes.skeleton} ${classes.skeleton_avatar_sm}`} />
              <span className={`${classes.skeleton} ${classes.skeleton_line_sm}`} />
            </div>
          </div>
        ) : isAuth ? (
          <div className={classes.user}>
                <div className={`${classes.noti} ${requests.length > 0 ? classes.noti_have : ''}`}>
                  <div className={`${classes.noti_lenght} ${requests.length <= 0 ? classes.noti_none : ''}`}>
                    <span>
                      {requests.length > 10 ? '10+' : requests.length}
                    </span>
                  </div>
                  <DropdownWrapper
                    right
                    noti
                    isOpen={isNotiOpen}
                    onClose={closeHeaderDropdown}
                    closeOnClick={false}
                  >
                    <div className={classes.noti_icon_con} onClick={() => toggleHeaderDropdown('notifications')}>
                      <Noti />
                      {requests.length > 0 && <span className={classes.badge} />}
                    </div>

                    <div className={classes.noti_con}>
                      <span className={classes.empty}>
                        {requests.length === 0 ? 'Нет уведомлений' : 'Уведомления'}
                      </span>
                      {[...requests]
                        .sort((a, b) => {
                          const da = new Date(a.created_at).getTime();
                          const db = new Date(b.created_at).getTime();
                          return db - da;
                        })
                        .map(req => (
                        <div
                          key={req.id}
                          id={`noti-${req.id}`}
                          className={classes.noti_item}
                          data-dropdown-class={highlightRequestId === req.id ? classes.noti_item_active : ''}
                        >
                          <NavLink
                            to={`/user/${req.username}`}
                            className={classes.noti_user_link}
                            onClick={closeHeaderDropdown} // закрываем dropdown при переходе
                          >
                            {req.avatar ? (
                              <img
                                src={req.avatar.startsWith('/uploads/') ? `${API_URL}${req.avatar}` : `${API_URL}/uploads/${req.avatar}`}
                                alt="Аватар"
                                className={classes.avatar}
                              />
                            ) : (
                              <Default />
                            )}
                          </NavLink>

                          <span>
                            <NavLink
                              to={`/user/${req.username}`}
                              className={classes.noti_user_link}
                              onClick={closeHeaderDropdown}
                            >
                              {req.nickname || req.username}
                            </NavLink>
                            подал заявку в друзья
                          </span>

                          <div className={classes.noti_int}>
                            <button onClick={() => acceptRequest(req.id)}>
                              <Accept />
                            </button>
                            <button onClick={() => rejectRequest(req.id)}>
                              <Deny />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </DropdownWrapper>
                </div>

                <DropdownWrapper
                  right
                  profile
                  isOpen={isProfileOpen}
                  onClose={closeHeaderDropdown}
                >
                  <div className={classes.profile} onClick={() => toggleHeaderDropdown('profile')}>
                    {showAvatarSkeleton ? (
                      <div className={`${classes.skeleton} ${classes.skeleton_avatar_sm}`} />
                    ) : null}
                    {user?.avatar ? (
                      <img
                        src={user.avatar.startsWith('/uploads/') ? `${API_URL}${user.avatar}` : `${API_URL}/uploads/${user.avatar}`}
                        alt="Аватар"
                        className={`${classes.avatar} ${showAvatarSkeleton ? classes.avatar_preload : ''}`}
                        onLoad={() => setIsAvatarLoaded(true)}
                        onError={() => setIsAvatarLoaded(true)}
                      />
                    ) : (
                      !isProfileLoading && <Default />
                    )}
                    <span className={classes.profile_header_top}>
                      {user?.username || 'Загрузка...'}
                    </span>
                  </div>
                  <div>
                    <NavLink to="/profile" onClick={closeHeaderDropdown}>
                      <div className={classes.profile_button}>
                        {showAvatarSkeleton ? (
                          <div className={`${classes.skeleton} ${classes.skeleton_avatar_md}`} />
                        ) : null}
                        {user?.avatar ? (
                          <img
                            src={user.avatar.startsWith('/uploads/') ? `${API_URL}${user.avatar}` : `${API_URL}/uploads/${user.avatar}`}
                            alt="Аватар"
                            className={`${classes.avatar} ${showAvatarSkeleton ? classes.avatar_preload : ''}`}
                            onLoad={() => setIsAvatarLoaded(true)}
                            onError={() => setIsAvatarLoaded(true)}
                          />
                        ) : (
                          !isProfileLoading && <Default />
                        )}
                        <div className={classes.profile_name_drop_con}>
                          <span className={classes.name_drop}>{user?.username || 'Загрузка...'}</span>
                          <div className={classes.email_drop}>
                            {user?.email ? (
                              <span className={classes.email_drop_item}>{user.email}</span>
                            ) : (
                              <span className={`${classes.skeleton} ${classes.skeleton_line_xs}`} />
                            )}
                            <Arrow />
                          </div>
                        </div>
                      </div>
                    </NavLink>
                    <LogoutButton />
                  </div>
                </DropdownWrapper>
            </div>
        ) : (
          <AuthTrigger type='login'>
            <div className={`${classes.user} ${classes.header_reg}`}>
              <span>
                Sign in
              </span>
            </div>
          </AuthTrigger>
        )}
      </div>
    </header>
  );
};

export default Header;










