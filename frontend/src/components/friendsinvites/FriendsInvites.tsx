import React, { useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import classes from './FriendsInvites.module.scss';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Accept from '@/assets/icons/monochrome/accept.svg';
import Deny from '@/assets/icons/monochrome/deny.svg';
import { API_URL } from '@/../axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { useNotificationsStore } from '@/store/notificationsStore';

const FriendsInvites: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const { requests, isLoading, fetchRequests, acceptRequest, rejectRequest } = useNotificationsStore();

  useEffect(() => {
    if (!isInitialized) return;
    fetchRequests();
  }, [fetchRequests, isInitialized, isAuth]);

  const sortedRequests = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      }),
    [requests]
  );

  if (!isAuth || isLoading || sortedRequests.length === 0) return null;

  return (
    <>
      {sortedRequests.map(req => {
        const avatarSrc = req.avatar
          ? req.avatar.startsWith('/uploads/')
            ? `${API_URL}${req.avatar}`
            : `${API_URL}/uploads/${req.avatar}`
          : null;

        return (
          <div key={req.id} className={classes.item}>
            <NavLink to={`/user/${req.username}`} className={classes.userLink}>
              {avatarSrc ? (
                <img src={avatarSrc} alt="Аватар" />
              ) : (
                <Default />
              )}
            </NavLink>

            <span className={classes.text}>
              <NavLink to={`/user/${req.username}`} className={classes.name}>
                {req.nickname || req.username}
              </NavLink>
              подал заявку в друзья
            </span>

            <div className={classes.actions}>
              <button type="button" onClick={() => acceptRequest(req.id)}>
                <Accept />
              </button>
              <button type="button" onClick={() => rejectRequest(req.id)}>
                <Deny />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
};

export default FriendsInvites;

