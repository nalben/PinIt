import React, { useEffect, useRef, useState } from 'react';
import classes from './Header.module.scss';
import { NavLink, useLocation } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Burger from '@/assets/icons/monochrome/burger.svg';
import { API_URL } from "@/api/axiosInstance";
import AuthTrigger from '@/components/auth/AuthTrigger';
import DropdownWrapper from '../dropdownwrapper/DropdownWrapper';
import ImageWithFallback from '@/components/_UI/imagewithfallback/ImageWithFallback';
import LogoutButton from '@/components/__general/logoutbutton/LogoutButton';
import Arrow from '@/assets/icons/monochrome/back.svg'
import Accept from '@/assets/icons/monochrome/accept.svg'
import Deny from '@/assets/icons/monochrome/deny.svg'
import { useAuthStore } from '@/store/authStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useBoardsInvitesStore } from '@/store/boardsInvitesStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';
import { applyTheme, getStoredTheme, getThemeLabel, persistTheme, THEME_OPTIONS } from '@/utils/theme';
import type { AppTheme } from '@/utils/theme';
import { useLanguageStore } from '@/store/languageStore';

type HeaderVariant = 'default' | 'board';
const PINIT_DESKTOP_UPDATES_URL = 'https://pin-it.ru/desktop-updates';

const Header = ({ variant = 'default' }: { variant?: HeaderVariant }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [isInstallerLoading, setIsInstallerLoading] = useState(false);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
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

  const handleInstallPinIt = async () => {
    if (isInstallerLoading) return;

    try {
      setIsInstallerLoading(true);

      const response = await fetch(`${PINIT_DESKTOP_UPDATES_URL}/latest.yml`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load latest.yml: ${response.status}`);
      }

      const latestYml = await response.text();
      const installerPathMatch =
        latestYml.match(/^\s*-\s+url:\s+(.+?)\s*$/m) ??
        latestYml.match(/^path:\s+(.+?)\s*$/m);
      const installerPath = installerPathMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '');

      if (!installerPath) {
        throw new Error('Installer path not found in latest.yml');
      }

      const installerUrl = new URL(installerPath, `${PINIT_DESKTOP_UPDATES_URL}/`).toString();
      const link = document.createElement('a');
      link.href = installerUrl;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      closeHeaderDropdown();
    } catch (error) {
      console.error(error);
      window.open(`${PINIT_DESKTOP_UPDATES_URL}/`, '_blank', 'noopener,noreferrer');
    } finally {
      setIsInstallerLoading(false);
    }
  };

  const activeThemeOption = THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0]!;
  const isEn = language === 'en';
  const activeThemeLabel = getThemeLabel(activeThemeOption, language);
  const activeLanguageLabel = language === 'en' ? 'English' : 'Русский';
  const languageOptions = [
    { id: 'ru' as const, label: 'Русский' },
    { id: 'en' as const, label: 'English' },
  ];

  useEffect(() => {
    if (isProfileOpen) return;
    setThemeDropdownOpen(false);
    setLanguageDropdownOpen(false);
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
          {isEn ? 'HOME' : 'ГЛАВНАЯ'}
        </NavLink>
        <NavLink to="/spaces" className={linkClass} onClick={handleMenuItemClick}>
          {isEn ? 'SPACES' : 'ДОСКИ'}
        </NavLink>
        <NavLink to="/converter" className={linkClass} onClick={handleMenuItemClick}>
          {isEn ? 'CONVERTER' : 'КОНВЕРТЕР'}
        </NavLink>
        {!isInitialized ? (
          <div className={classes.item}>{isEn ? 'PROFILE' : 'ПРОФИЛЬ'}</div>
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
            {isEn ? 'PROFILE' : 'ПРОФИЛЬ'}
          </NavLink>
        ) : (
          <AuthTrigger type='login'>
            <div className={classes.item}>{isEn ? 'PROFILE' : 'ПРОФИЛЬ'}</div>
          </AuthTrigger>
        )}
      </nav>

      <div className={classes.profile_container}>
        <div className={classes.theme_switcher} aria-label={isEn ? 'Theme selection' : 'Выбор темы'}>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${classes.theme_button} ${theme === option.id ? classes.theme_button_active : ''}`.trim()}
              onClick={() => handleThemeChange(option.id)}
              aria-label={`${isEn ? 'Theme' : 'Тема'} ${getThemeLabel(option, language)}`}
              title={`${isEn ? 'Theme' : 'Тема'} ${getThemeLabel(option, language)}`}
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
                        {totalNotiCount === 0 ? (isEn ? 'No notifications' : 'Нет уведомлений') : (isEn ? 'Notifications' : 'Уведомления')}
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
                              <ImageWithFallback
                                src={req.avatar.startsWith('/uploads/') ? `${API_URL}${req.avatar}` : `${API_URL}/uploads/${req.avatar}`}
                                alt={isEn ? 'Avatar' : 'Аватар'}
                                className={classes.avatar}
                                fallback={<Default />}
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
                            {isEn ? ' sent you a friend request' : ' подал заявку в друзья'}
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
                              <ImageWithFallback
                                src={invite.avatar.startsWith('/uploads/') ? `${API_URL}${invite.avatar}` : `${API_URL}/uploads/${invite.avatar}`}
                                alt={isEn ? 'Avatar' : 'Аватар'}
                                className={classes.avatar}
                                fallback={<Default />}
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
                            {isEn ? ' invited you to board ' : ' пригласил(а) в доску '}
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
                      <ImageWithFallback
                        src={user.avatar.startsWith('/uploads/') ? `${API_URL}${user.avatar}` : `${API_URL}/uploads/${user.avatar}`}
                        alt={isEn ? 'Avatar' : 'Аватар'}
                        className={`${classes.avatar} ${showAvatarSkeleton ? classes.avatar_preload : ''}`}
                        onLoad={() => setIsAvatarLoaded(true)}
                        onError={() => setIsAvatarLoaded(true)}
                        fallback={!isProfileLoading ? <Default /> : null}
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
                          <ImageWithFallback
                            src={user.avatar.startsWith('/uploads/') ? `${API_URL}${user.avatar}` : `${API_URL}/uploads/${user.avatar}`}
                            alt={isEn ? 'Avatar' : 'Аватар'}
                            className={`${classes.avatar} ${showAvatarSkeleton ? classes.avatar_preload : ''}`}
                            onLoad={() => setIsAvatarLoaded(true)}
                            onError={() => setIsAvatarLoaded(true)}
                            fallback={!isProfileLoading ? <Default /> : null}
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
                      data-dropdown-class={`${classes.profile_theme_item} ${languageDropdownOpen ? classes.profile_theme_item_open : ''}`.trim()}
                      className={classes.profile_theme_item_content}
                    >
                      <div className={classes.profile_theme_panel} onClick={(event) => event.stopPropagation()}>
                        <DropdownWrapper
                          fixed
                          middleleftTop
                          anchorToButton
                          fixedMarginPx={0}
                          repositionOnScroll
                          isOpen={languageDropdownOpen}
                          onClose={() => setLanguageDropdownOpen(false)}
                          menuClassName={classes.profile_theme_menu}
                          wrapperClassName={classes.profile_theme_dropdown_wrapper}
                          buttonClassName={classes.profile_theme_dropdown_button}
                        >
                          <button
                            type="button"
                            className={classes.profile_theme_trigger}
                            onClick={() => {
                              setThemeDropdownOpen(false);
                              setLanguageDropdownOpen((prev) => !prev);
                            }}
                            aria-expanded={languageDropdownOpen}
                            aria-label={`${isEn ? 'Language' : 'Язык'}: ${activeLanguageLabel}`}
                          >
                            <span className={classes.profile_theme_copy}>{`${isEn ? 'Language' : 'Язык'}: ${activeLanguageLabel}`}</span>
                            <span className={classes.profile_theme_arrow}>
                              <Arrow />
                            </span>
                          </button>
                          <div>
                            {languageOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                data-dropdown-class={`${classes.profile_theme_option_item} ${language === option.id ? classes.profile_theme_option_item_active : ''}`.trim()}
                                className={classes.profile_theme_option}
                                onClick={() => {
                                  setLanguage(option.id);
                                  setLanguageDropdownOpen(false);
                                }}
                                aria-label={`${isEn ? 'Choose language' : 'Выбрать язык'} ${option.label}`}
                              >
                                <span>{option.label}</span>
                              </button>
                            ))}
                          </div>
                        </DropdownWrapper>
                      </div>
                    </div>
                    <div
                      data-dropdown-class={`${classes.profile_theme_item} ${themeDropdownOpen ? classes.profile_theme_item_open : ''}`.trim()}
                      className={classes.profile_theme_item_content}
                    >
                      <div className={classes.profile_theme_panel} onClick={(event) => event.stopPropagation()}>
                        <DropdownWrapper
                          fixed
                          middleleftTop
                          anchorToButton
                          fixedMarginPx={0}
                          repositionOnScroll
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
                              setLanguageDropdownOpen(false);
                              setThemeDropdownOpen((prev) => !prev);
                            }}
                            aria-expanded={themeDropdownOpen}
                            aria-label={`${isEn ? 'Theme' : 'Тема'}: ${activeThemeLabel}`}
                          >
                            <span className={classes.profile_theme_copy}>{`${isEn ? 'Theme' : 'Тема'}: ${activeThemeLabel}`}</span>
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
                                aria-label={`${isEn ? 'Choose theme' : 'Выбрать тему'} ${getThemeLabel(option, language)}`}
                              >
                                <span className={`${classes.theme_button_swatch} ${classes.theme_button_swatch_inline} ${classes[`theme_button_swatch_${option.id}`]}`.trim()} />
                                <span>{getThemeLabel(option, language)}</span>
                              </button>
                            ))}
                          </div>
                        </DropdownWrapper>
                      </div>
                    </div>
                    {__PLATFORM__ === 'desktop' ? (
                      <div
                        data-dropdown-class={classes.profile_install_item}
                        className={classes.profile_install_item_content}
                      >
                        <button
                          type="button"
                          className={classes.profile_install_button}
                          onClick={handleInstallPinIt}
                          disabled={isInstallerLoading}
                        >
                          {isInstallerLoading ? (isEn ? 'Downloading PinIt...' : 'Скачивание PinIt...') : (isEn ? 'Install PinIt' : 'Установить PinIt')}
                        </button>
                      </div>
                    ) : null}
                    <LogoutButton
                      data-dropdown-class={classes.profile_logout_item}
                      className={classes.profile_logout_item_content}
                      closeSignal={themeDropdownOpen || languageDropdownOpen}
                      onOpenChange={(open) => {
                        if (open) {
                          setThemeDropdownOpen(false);
                          setLanguageDropdownOpen(false);
                        }
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
                {isEn ? 'Sign in' : 'Войти'}
              </span>
            </div>
          </AuthTrigger>
        )}
      </div>
    </header>
  );
};

export default Header;










