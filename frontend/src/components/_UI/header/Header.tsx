import React, { useEffect, useRef, useState } from 'react';
import classes from './Header.module.scss';
import { NavLink, useLocation } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Burger from '@/assets/icons/monochrome/burger.svg';
import { API_URL } from "@/api/axiosInstance";
import AuthTrigger from '@/components/auth/AuthTrigger';
import DropdownWrapper from '../dropdownwrapper/DropdownWrapper';
import LogoutButton from '@/components/__general/logoutbutton/LogoutButton';
import Arrow from '@/assets/icons/monochrome/back.svg'
import Accept from '@/assets/icons/monochrome/accept.svg'
import Deny from '@/assets/icons/monochrome/deny.svg'
import { useAuthStore } from '@/store/authStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useBoardsInvitesStore } from '@/store/boardsInvitesStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';
import { applyTheme, getStoredTheme, persistTheme, THEME_OPTIONS } from '@/utils/theme';
import type { AppTheme } from '@/utils/theme';

type HeaderVariant = 'default' | 'board';

const Header = ({ variant = 'default' }: { variant?: HeaderVariant }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);
  const menuRef = useRef<HTMLElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement | null>(null);
  const [isAvatarLoaded, setIsAvatarLoaded] = useState(false);
  const { requests, fetchRequests, acceptRequest, rejectRequest, highlightRequestId, setHighlightRequestId } = useNotificationsStore();
  const requestsCount = requests.length;
  const { invites, fetchInvites, acceptInvite, rejectInvite } = useBoardsInvitesStore();
  const invitesCount = invites.length;
  const totalNotiCount = requestsCount + invitesCount;
  const {
    headerDropdown,
    toggleHeaderDropdown,
    closeHeaderDropdown
  } = useUIStore();

  const isProfileOpen = headerDropdown === 'profile';
  const isNotiOpen = headerDropdown === 'notifications';
  const isProfileLoading = !isInitialized;
  const showAvatarSkeleton = isProfileLoading || (!!user?.avatar && !isAvatarLoaded);

  useEscapeHandler({
    id: 'header:dropdown-profile',
    priority: 1000,
    isOpen: isProfileOpen,
    onEscape: closeHeaderDropdown,
  });

  useEscapeHandler({
    id: 'header:dropdown-notifications',
    priority: 1000,
    isOpen: isNotiOpen,
    onEscape: closeHeaderDropdown,
  });

  useEscapeHandler({
    id: 'header:burger-menu',
    priority: 900,
    isOpen: menuOpen,
    onEscape: () => setMenuOpen(false),
  });
    
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? `${classes.item} ${classes.active}`
      : classes.item;

  useEffect(() => {
    const handlePointerDownOutside = (e: Event) => {
      const target = e.target as Node | null;
      if (
        menuRef.current &&
        target &&
        !menuRef.current.contains(target) &&
        burgerRef.current &&
        !burgerRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, []);

useEffect(() => {
  if (!isInitialized) return;
  if (!isAuth) return;
  if (requestsCount > 0) return;
  fetchRequests();
}, [fetchRequests, isAuth, isInitialized, requestsCount]);

useEffect(() => {
  if (!isInitialized) return;
  if (!isAuth) return;
  if (invitesCount > 0) return;
  fetchInvites();
}, [fetchInvites, invitesCount, isAuth, isInitialized]);

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

  const handleThemeChange = (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setThemeDropdownOpen(false);
  };

  const handleLogoutConfirm = () => {
    closeHeaderDropdown();
    logout();
  };

  const activeThemeOption = THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0]!;

  useEffect(() => {
    if (isProfileOpen) return;
    setThemeDropdownOpen(false);
  }, [isProfileOpen]);

  return (
    <header
      className={`${classes.container} ${variant === 'board' ? classes.container_board : ''} ${__PLATFORM__ === 'desktop' ? classes.header_desktop : classes.header_mobile}`.trim()}
    >
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
        <NavLink to="/converter" className={linkClass} onClick={handleMenuItemClick}>
          CONVERTER
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
        <div className={classes.theme_switcher} aria-label="Выбор темы">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${classes.theme_button} ${theme === option.id ? classes.theme_button_active : ''}`.trim()}
              onClick={() => handleThemeChange(option.id)}
              aria-label={`Тема ${option.label}`}
              title={`Тема ${option.label}`}
            >
              <span className={`${classes.theme_button_swatch} ${classes[`theme_button_swatch_${option.id}`]}`.trim()} />
            </button>
          ))}
        </div>

        {!isInitialized ? (
          <div className={classes.user} aria-busy="true">
            <div className={`${classes.skeleton} ${classes.skeleton_noti}`} aria-hidden="true" />
            <div className={classes.profile}>
              <div className={`${classes.skeleton} ${classes.skeleton_avatar_sm}`} />
              <span className={`${classes.skeleton} ${classes.skeleton_line_sm}`} />
            </div>
          </div>
        ) : isAuth ? (
          <div className={classes.user}>
                <div className={`${classes.noti} ${totalNotiCount > 0 ? classes.noti_have : ''}`}>
                  <div className={`${classes.noti_lenght} ${totalNotiCount <= 0 ? classes.noti_none : ''}`}>
                    <span>
                      {totalNotiCount > 10 ? '10+' : totalNotiCount}
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
                      {totalNotiCount > 0 && <span className={classes.badge} />}
                    </div>

                    <div className={classes.noti_con}>
                      <span className={classes.empty}>
                        {totalNotiCount === 0 ? 'Нет уведомлений' : 'Уведомления'}
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
                      {[...invites]
                        .sort((a, b) => {
                          const da = new Date(a.created_at).getTime();
                          const db = new Date(b.created_at).getTime();
                          return db - da;
                        })
                        .map(invite => (
                        <div
                          key={`board-${invite.id}`}
                          className={classes.noti_item}
                          data-dropdown-class={''}
                        >
                          <NavLink
                            to={`/user/${invite.username}`}
                            className={classes.noti_user_link}
                            onClick={closeHeaderDropdown}
                          >
                            {invite.avatar ? (
                              <img
                                src={invite.avatar.startsWith('/uploads/') ? `${API_URL}${invite.avatar}` : `${API_URL}/uploads/${invite.avatar}`}
                                alt="Аватар"
                                className={classes.avatar}
                              />
                            ) : (
                              <Default />
                            )}
                          </NavLink>

                          <span>
                            <NavLink
                              to={`/user/${invite.username}`}
                              className={classes.noti_user_link}
                              onClick={closeHeaderDropdown}
                            >
                              {invite.nickname || invite.username}
                            </NavLink>
                            {' пригласил(а) в доску '}
                            <span className={classes.board_invite_name}>
                              {invite.title}
                            </span>
                          </span>

                          <div className={classes.noti_int}>
                            <button onClick={() => acceptInvite(invite.id)}>
                              <Accept />
                            </button>
                            <button onClick={() => rejectInvite(invite.id)}>
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
                      {user?.username || ''}
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
                          <span className={classes.name_drop}>{user?.username || ''}</span>
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
                    <div
                      data-dropdown-class={`${classes.profile_theme_item} ${themeDropdownOpen ? classes.profile_theme_item_open : ''}`.trim()}
                      className={classes.profile_theme_item_content}
                    >
                      <div className={classes.profile_theme_panel} onClick={(event) => event.stopPropagation()}>
                        <DropdownWrapper
                          fixed
                          middleleftTop
                          isOpen={themeDropdownOpen}
                          onClose={() => setThemeDropdownOpen(false)}
                          menuClassName={classes.profile_theme_menu}
                          wrapperClassName={classes.profile_theme_dropdown_wrapper}
                          buttonClassName={classes.profile_theme_dropdown_button}
                        >
                          <button
                            type="button"
                            className={classes.profile_theme_trigger}
                            onClick={() => {
                              setThemeDropdownOpen((prev) => !prev);
                            }}
                            aria-expanded={themeDropdownOpen}
                            aria-label={`\u0422\u0435\u043c\u0430 : ${activeThemeOption.label}`}
                          >
                            <span className={classes.profile_theme_copy}>{`\u0422\u0435\u043c\u0430 : ${activeThemeOption.label}`}</span>
                            <span className={`${classes.theme_button_swatch} ${classes.theme_button_swatch_inline} ${classes[`theme_button_swatch_${activeThemeOption.id}`]}`.trim()} />
                          </button>
                          <div>
                            {THEME_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                data-dropdown-class={`${classes.profile_theme_option_item} ${theme === option.id ? classes.profile_theme_option_item_active : ''}`.trim()}
                                className={classes.profile_theme_option}
                                onClick={() => handleThemeChange(option.id)}
                                aria-label={`\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0442\u0435\u043c\u0443 ${option.label}`}
                              >
                                <span className={`${classes.theme_button_swatch} ${classes.theme_button_swatch_inline} ${classes[`theme_button_swatch_${option.id}`]}`.trim()} />
                                <span>{option.label}</span>
                              </button>
                            ))}
                          </div>
                        </DropdownWrapper>
                      </div>
                    </div>
                    <LogoutButton
                      data-dropdown-class={classes.profile_logout_item}
                      className={classes.profile_logout_item_content}
                      closeSignal={themeDropdownOpen}
                      onOpenChange={(open) => {
                        if (open) setThemeDropdownOpen(false);
                      }}
                      onLogout={handleLogoutConfirm}
                    />
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










