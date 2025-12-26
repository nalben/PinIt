import React from 'react';
import classes from './AuthModal.module.scss';
import Back from '@/assets/icons/colored/back.svg'

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;           // новый пропс для стрелочки "назад"
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
        {/* Закрыть */}
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
