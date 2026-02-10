import React, { useEffect, useMemo, useState } from 'react';
import classes from './BoardsInvites.module.scss';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { useBoardsInvitesStore } from '@/store/boardsInvitesStore';
import AuthTrigger from '../auth/AuthTrigger';

const BoardsInvites: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const invites = useBoardsInvitesStore(state => state.invites);
  const isLoading = useBoardsInvitesStore(state => state.isLoading);
  const fetchInvites = useBoardsInvitesStore(state => state.fetchInvites);
  const acceptInvite = useBoardsInvitesStore(state => state.acceptInvite);
  const rejectInvite = useBoardsInvitesStore(state => state.rejectInvite);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useEffect(() => {
    if (forceSkeleton) return;
    if (!isInitialized) return;
    if (!isAuth) return;

    let mounted = true;
    setHasLoadedOnce(false);
    fetchInvites().finally(() => {
      if (!mounted) return;
      setHasLoadedOnce(true);
    });

    return () => {
      mounted = false;
    };
  }, [fetchInvites, isInitialized, isAuth, forceSkeleton]);

  const sortedInvites = useMemo(
    () =>
      [...invites].sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      }),
    [invites]
  );

  const skeleton = (
    <div className={classes.root} aria-busy="true">
      <h2>Приглашения в доски:</h2>
      <div className={classes.list}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className={classes.item}>
            <div className={classes.avatar}>
              <div className={`${classes.skeleton} ${classes.skeleton_avatar}`} />
            </div>

            <div className={classes.text}>
              <div className={`${classes.skeleton} ${classes.skeleton_line}`} />
              <div className={`${classes.skeleton} ${classes.skeleton_line_sm}`} />
            </div>

            <div className={classes.actions}>
              <div className={`${classes.skeleton} ${classes.skeleton_btn}`} />
              <div className={`${classes.skeleton} ${classes.skeleton_btn}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (forceSkeleton || !isInitialized) return skeleton;
  if (isAuth && (isLoading || !hasLoadedOnce) && sortedInvites.length === 0) return skeleton;

  return (
    <div className={classes.root}>
      <h2>Приглашения в доски:</h2>

      {!isAuth ? (
        <div className={classes.empty}>
          <h3>Войдите чтобы увидеть приглашения в доски</h3>
          <AuthTrigger type='login'>
            <Mainbtn variant="mini" text="Войти" />
          </AuthTrigger>
        </div>
      ) : sortedInvites.length === 0 ? (
        <div className={classes.empty}>
          <h3>Приглашений в доски не найдено</h3>
          <Mainbtn variant="mini" text="Создать доску" />
        </div>
      ) : (
        <div className={classes.list}>
          {sortedInvites.map(invite => {
            const avatarSrc = invite.avatar
              ? invite.avatar.startsWith('/uploads/')
                ? `${API_URL}${invite.avatar}`
                : `${API_URL}/uploads/${invite.avatar}`
              : null;

            const inviterName = invite.nickname || invite.username;

            return (
              <div key={invite.id} className={classes.item}>
                <div className={classes.avatar}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Аватар" />
                  ) : (
                    <Default />
                  )}
                </div>

                <div className={classes.text}>
                  <span>{inviterName}</span> Приглашает в доску <span>{invite.title}</span>
                </div>

                <div className={classes.actions}>
                  <Mainbtn
                    variant="mini"
                    text="принять"
                    onClick={() => acceptInvite(invite.id)}
                  />
                  <Mainbtn
                    variant="mini"
                    text="отклонить"
                    onClick={() => rejectInvite(invite.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BoardsInvites;
