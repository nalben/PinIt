import React from 'react';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import { useUIStore } from '@/store/uiStore';

const BoardSettingsModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.boardSettingsModalOpen);
  const close = useUIStore((s) => s.closeBoardSettingsModal);

  return (
    <AuthModal isOpen={isOpen} onClose={close} closeOnOverlayClick={false}>
      <div>
        mama
      </div>
    </AuthModal>
  );
};

export default BoardSettingsModal;
