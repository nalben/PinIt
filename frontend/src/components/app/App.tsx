import React, { useEffect } from 'react';
import { useState } from 'react';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom';
import classes from './App.module.scss';
import "@/styles/general.scss";
import "@/styles/fonts.scss";
import "@/styles/variables.scss";
import Header from '../_UI/header/Header';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useBoardsInvitesStore } from '@/store/boardsInvitesStore';
import { connectSocket, disconnectSocket } from '@/services/socketManager';
import { useAuthStore } from '@/store/authStore';
import { useFriendsStore } from '@/store/friendsStore';
import { useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';
import Appitit from './AppInit'
import FriendsModal from '@/components/friends/friendsmodal/FriendsModal';
import CreateBoardModal from '@/components/boards/createboardmodal/CreateBoardModal';
import { useUIStore } from '@/store/uiStore';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import LoginForm from '@/components/auth/login/Login';
import RegisterForm from '@/components/auth/register/Register';
import ResetPasswordForm from '@/components/auth/reset/ResetPasswordForm';

const PENDING_INVITE_LS_KEY = 'pinit_pendingInviteUrl';

type AuthView = 'login' | 'register' | 'reset';

const GlobalAuthModals = () => {
  const authModalOpen = useUIStore((s) => s.authModalOpen);
  const closeAuthModal = useUIStore((s) => s.closeAuthModal);
  const [view, setView] = useState<AuthView>('login');

  useEffect(() => {
    if (!authModalOpen) return;
    setView('login');
  }, [authModalOpen]);

  const close = () => {
    closeAuthModal();
  };

  return (
    <>
      <AuthModal isOpen={authModalOpen && view === 'login'} onClose={close}>
        <LoginForm onOpenReset={() => setView('reset')} onOpenRegister={() => setView('register')} onClose={close} />
      </AuthModal>

      <AuthModal isOpen={authModalOpen && view === 'register'} onClose={close} closeOnOverlayClick={false}>
        <RegisterForm onClose={close} />
      </AuthModal>

      <AuthModal
        isOpen={authModalOpen && view === 'reset'}
        onClose={close}
        closeOnOverlayClick={false}
        onBack={() => setView('login')}
      >
        <ResetPasswordForm onClose={close} />
      </AuthModal>
    </>
  );
};

const Root = () => {
  const { addRequest, removeRequest, updateRequestStatus } = useNotificationsStore();
  const { addInvite, removeInvite } = useBoardsInvitesStore();
  const fetchFriends = useFriendsStore((s) => s.fetchFriends);
  const handleBoardsUpdated = useBoardsUnifiedStore((s) => s.handleBoardsUpdated);
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);
  const userId = useAuthStore(state => state.user?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const closeAuthModal = useUIStore((s) => s.closeAuthModal);
  const isBoardPage = Boolean(matchPath('/spaces/:boardId', location.pathname));

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuth) {
      disconnectSocket();
      useBoardsUnifiedStore.getState().clearAuthBoards();
      return;
    }

    const unsubscribe = connectSocket({
      onNewRequest: addRequest,

      onRemoveRequest: (data) => {
        const id = Number(data.id ?? data.requestId);
        if (!isNaN(id)) removeRequest(id);
      },

      onNewBoardInvite: addInvite,

      onRemoveBoardInvite: (data) => {
        const id = Number(data.id ?? data.inviteId);
        if (!isNaN(id)) removeInvite(id);
      },

      onFriendStatusChange: (data) => {
        const { requestId, status: rawStatus } = data;
        if (!requestId) return;

        const validStatuses = ['friend', 'none', 'sent', 'received', 'rejected'] as const;
        if (!validStatuses.includes(rawStatus as typeof validStatuses[number])) {
          console.warn('Получен неизвестный статус дружбы:', rawStatus);
          return;
        }

        const status = rawStatus as typeof validStatuses[number];
        updateRequestStatus(requestId, status);

        if (typeof userId === 'number') {
          if (status === 'friend') {
            fetchFriends(userId);
          } else if (status === 'none') {
            const otherUserId = Number((data as { userId?: unknown }).userId);
            const isExistingFriend = Number.isFinite(otherUserId) && useFriendsStore.getState().friends.some((f) => f.id === otherUserId);
            if (isExistingFriend) fetchFriends(userId);
          }
        }
      },
      onBoardsUpdate: (data) => {
        handleBoardsUpdated(data as { reason?: string; board_id?: number });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [addInvite, addRequest, fetchFriends, handleBoardsUpdated, isAuth, isInitialized, removeInvite, removeRequest, updateRequestStatus, userId]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuth) return;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PENDING_INVITE_LS_KEY);
    } catch {
      return;
    }

    if (!raw) return;

    const normalizeToRelative = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;

      if (trimmed.startsWith('/')) return trimmed;

      try {
        const u = new URL(trimmed);
        return `${u.pathname}${u.search}`;
      } catch {
        return null;
      }
    };

    const relative = normalizeToRelative(raw);
    if (!relative) {
      try {
        localStorage.removeItem(PENDING_INVITE_LS_KEY);
      } catch {
        // ignore
      }
      return;
    }

    let parsed: URL | null = null;
    try {
      parsed = new URL(relative, window.location.origin);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      try {
        localStorage.removeItem(PENDING_INVITE_LS_KEY);
      } catch {
        // ignore
      }
      return;
    }

    if (!parsed.pathname.startsWith('/spaces/')) {
      try {
        localStorage.removeItem(PENDING_INVITE_LS_KEY);
      } catch {
        // ignore
      }
      return;
    }

    const invite = parsed.searchParams.get('invite');
    if (!invite) {
      try {
        localStorage.removeItem(PENDING_INVITE_LS_KEY);
      } catch {
        // ignore
      }
      return;
    }

    try {
      localStorage.removeItem(PENDING_INVITE_LS_KEY);
    } catch {
      // ignore
    }

    closeAuthModal();
    navigate(`${parsed.pathname}${parsed.search}`, { replace: true });
  }, [closeAuthModal, isAuth, isInitialized, navigate]);

  return (
    <div className={classes.sitecon}>
      <Appitit />
      <main className={classes.pagecontent}>
        <Header variant={isBoardPage ? 'board' : 'default'} />
        {!isBoardPage && <div className={classes.header_spacer} aria-hidden="true" />}
        <Outlet />
        <CreateBoardModal />
        <FriendsModal />
        <GlobalAuthModals />
      </main>
    </div>
  );
};

export default Root;

