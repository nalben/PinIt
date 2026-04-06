import React, { useEffect, useState } from 'react';
import classes from './LogoutButton.module.scss';
import Arrow from '@/assets/icons/monochrome/back.svg';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import { useAuthStore } from '@/store/authStore';

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
  const [isOpen, setIsOpen] = useState(false);

  const setOpen = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

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
            aria-label="Выйти"
          >
            <span className={classes.copy}>Выйти</span>
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
              aria-label="Подтвердить выход"
            >
              <span>Да, выйти</span>
              <span className={classes.arrow}>
                <Arrow />
              </span>
            </button>
            <button
              type="button"
              data-dropdown-class={classes.option_item}
              className={classes.option}
              onClick={() => setOpen(false)}
              aria-label="Отмена выхода"
            >
              Отмена
            </button>
          </div>
        </DropdownWrapper>
      </div>
    </div>
  );
};

export default LogoutButton;
