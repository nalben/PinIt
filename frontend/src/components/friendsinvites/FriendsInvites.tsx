import React, { useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import classes from './FriendsInvites.module.scss';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Accept from '@/assets/icons/monochrome/accept.svg';
import Deny from '@/assets/icons/monochrome/deny.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import AuthTrigger from '../auth/AuthTrigger';

const FriendsInvites: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const { requests, isLoading, fetchRequests, acceptRequest, rejectRequest } = useNotificationsStore();
  const requestsCount = requests.length;
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useEffect(() => {
    if (forceSkeleton) return;
    if (!isInitialized || !isAuth) return;
    if (requestsCount > 0) return;
    fetchRequests();
  }, [fetchRequests, isInitialized, isAuth, requestsCount, forceSkeleton]);

  const sortedRequests = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      }),
    [requests]
  );

  const skeleton = (
    <div className={classes.root} aria-busy="true">
      <h2>Приглашения в друзья:</h2>
      <div className={classes.list}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className={classes.item}>
            <div className={`${classes.skeleton} ${classes.skeleton_avatar}`} />
            <div className={`${classes.text} ${classes.skeleton_text}`}>
              <div className={`${classes.skeleton} ${classes.skeleton_name}`} />
              <div className={`${classes.skeleton} ${classes.skeleton_line}`} />
            </div>
            <div className={classes.actions}>
              <div className={`${classes.skeleton} ${classes.skeleton_icon}`} />
              <div className={`${classes.skeleton} ${classes.skeleton_icon}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (forceSkeleton || !isInitialized) return skeleton;

  if (!isAuth) {
    return (
      <div className={classes.root}>
        <h2>Приглашения в друзья:</h2>
        <div className={classes.empty}>
          <h3>Войдите чтобы увидеть заявки в друзья</h3>
          <AuthTrigger type='login'>
            <Mainbtn
              variant='mini'
              text='Войти'
            />
          </AuthTrigger>
        </div>
      </div>
    );
  }

  if (isLoading && requestsCount === 0) return skeleton;

  return (
    <div className={classes.root}>
      <h2>Приглашения в друзья:</h2>

      {(isLoading || requestsCount > 0) && (
        <div className={classes.list}>
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
        </div>
      )}

      {!isLoading && requestsCount === 0 && (
        <div className={classes.empty}>
          <h3>У вас пока что нет заявок в друзья</h3>
          <Mainbtn
            variant='mini'
            text='Пригласить в друзья'
          />
        </div>
      )}
    </div>
  );
};

export default FriendsInvites;
