import React from 'react';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import classes from './UnsavedChangesModal.module.scss';

type UnsavedChangesModalProps = {
  isOpen: boolean;
  onSaveAndClose: () => void;
  onDiscardChanges: () => void;
  onContinueEditing: () => void;
  wide?: boolean;
  title?: string;
  description?: string;
  saveLabel?: string;
  discardLabel?: string;
  continueLabel?: string;
};

const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onSaveAndClose,
  onDiscardChanges,
  onContinueEditing,
  wide = false,
  title = '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0440\u0430\u0431\u043e\u0442\u044b?',
  description = '\u0415\u0441\u0442\u044c \u043d\u0435\u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f.',
  saveLabel = '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c',
  discardLabel = '\u041d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0442\u044c',
  continueLabel = '\u041e\u0442\u043c\u0435\u043d\u0430',
}) => (
  <AuthModal
    isOpen={isOpen}
    onClose={onContinueEditing}
    closeOnOverlayClick={false}
    modalClassName={wide ? classes.modalWide : undefined}
    modalScope="unsaved-changes"
  >
    <div className={classes.root}>
      <div className={classes.title}>{title}</div>
      <p className={classes.description}>{description}</p>
      <div className={classes.actions}>
        <Mainbtn variant="mini" kind="button" type="button" text={saveLabel} onClick={onSaveAndClose} className={classes.primary} />
        <Mainbtn variant="mini" kind="button" type="button" text={discardLabel} onClick={onDiscardChanges} className={classes.secondary} />
        <Mainbtn variant="mini" kind="button" type="button" text={continueLabel} onClick={onContinueEditing} className={`${classes.secondary} ${classes.cancel}`.trim()} />
      </div>
    </div>
  </AuthModal>
);

export default UnsavedChangesModal;
