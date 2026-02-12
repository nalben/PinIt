import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import classes from './App.module.scss';
import "@/styles/general.scss";
import "@/styles/fonts.scss";
import "@/styles/variables.scss";
import Header from '../_UI/header/Header';
import { useNotificationsStore } from '@/store/notificationsStore';
import { connectSocket, disconnectSocket } from '@/services/socketManager';
import { useAuthStore } from '@/store/authStore';
import Appitit from './AppInit'
import FriendsModal from '@/components/friendsmodal/FriendsModal';

const Root = () => {
  const { addRequest, removeRequest, updateRequestStatus } = useNotificationsStore();
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuth) {
      disconnectSocket();
      return;
    }

    const unsubscribe = connectSocket({
      onNewRequest: addRequest,

      onRemoveRequest: (data) => {
        const id = Number(data.id ?? data.requestId);
        if (!isNaN(id)) removeRequest(id);
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
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [addRequest, removeRequest, updateRequestStatus, isAuth, isInitialized]);

  return (
    <div className={classes.sitecon}>
      <Appitit />
      <main className={classes.pagecontent}>
        <Header />
        <Outlet />
        <FriendsModal />
      </main>
    </div>
  );
};

export default Root;

