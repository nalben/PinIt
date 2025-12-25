import React from 'react';
import classes from './AuthModal.module.scss';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
}

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
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
        <button
          type="button"
          className={classes.close}
          onClick={onClose}
        >
          +
        </button>
        {children}
      </div>
    </div>
  );
};

export default AuthModal;
