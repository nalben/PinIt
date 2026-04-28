import React, { useEffect, useState } from 'react';
import classes from './LogoutButton.module.scss';
import Arrow from '@/assets/icons/monochrome/back.svg';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import { useAuthStore } from '@/store/authStore';
import { useLanguageStore } from '@/store/languageStore';

type LogoutButtonProps = {
  onOpenChange?: (open: boolean) => void;
  onLogout?: () => void;
  closeSignal?: unknown;
  className?: string;
  'data-dropdown-class'?: string;
};

const LogoutButton: React.FC<LogoutButtonProps> = ({
  onOpenChange,
  onLogout,
  closeSignal,
  className,
  'data-dropdown-class': dataDropdownClass,
}) => {
  const logout = useAuthStore((state) => state.logout);
  const language = useLanguageStore((state) => state.language);
  const [isOpen, setIsOpen] = useState(false);
  const isEn = language === 'en';

  const setOpen = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    setIsOpen(false);
    onOpenChange?.(false);
  }, [closeSignal, onOpenChange]);

  const handleLogout = () => {
    setOpen(false);
    if (onLogout) {
      onLogout();
      return;
    }
    logout();
  };

  return (
    <div data-dropdown-class={dataDropdownClass} className={`${classes.root} ${className ?? ''}`.trim()}>
      <div className={classes.panel} onClick={(event) => event.stopPropagation()}>
        <DropdownWrapper
          fixed
          middleleftTop
          isOpen={isOpen}
          onClose={() => setOpen(false)}
          menuClassName={classes.menu}
          wrapperClassName={classes.dropdown_wrapper}
          buttonClassName={classes.dropdown_button}
        >
          <button
            type="button"
            className={classes.button}
            onClick={() => setOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isEn ? 'Sign out' : 'Выйти'}
          >
            <span className={classes.copy}>{isEn ? 'Sign out' : 'Выйти'}</span>
            <span className={classes.arrow}>
              <Arrow />
            </span>
          </button>
          <div>
            <button
              type="button"
              data-dropdown-class={`${classes.option_item} ${classes.option_item_danger}`.trim()}
              className={`${classes.option} ${classes.option_danger}`.trim()}
              onClick={handleLogout}
              aria-label={isEn ? 'Confirm sign out' : 'Подтвердить выход'}
            >
              <span>{isEn ? 'Yes, sign out' : 'Да, выйти'}</span>
              <span className={classes.arrow}>
                <Arrow />
              </span>
            </button>
            <button
              type="button"
              data-dropdown-class={classes.option_item}
              className={classes.option}
              onClick={() => setOpen(false)}
              aria-label={isEn ? 'Cancel sign out' : 'Отмена выхода'}
            >
              {isEn ? 'Cancel' : 'Отмена'}
            </button>
          </div>
        </DropdownWrapper>
      </div>
    </div>
  );
};

export default LogoutButton;
