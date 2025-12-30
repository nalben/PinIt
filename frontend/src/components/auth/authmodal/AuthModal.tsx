import React, { useEffect } from 'react';
import classes from './AuthModal.module.scss';
import Back from '@/assets/icons/colored/back.svg'

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
}

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onBack,
  children,
  closeOnOverlayClick = true,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) {
      onClose();
    }
  };

  return (
    <div className={classes.overlay} onClick={handleOverlayClick}>
      <div
        className={classes.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={classes.close}
          onClick={onClose}
        >
          +
        </button>
        {onBack && (
          <button
            type="button"
            className={classes.back}
            onClick={onBack}
          >
            <Back />
          </button>
        )}

        {children}
      </div>
    </div>
  );
};

export default AuthModal;
