import React, { useEffect, useMemo } from 'react';
import classes from './BoardsInvites.module.scss';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { useBoardsInvitesStore } from '@/store/boardsInvitesStore';

const BoardsInvites: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const invites = useBoardsInvitesStore(state => state.invites);
  const isLoading = useBoardsInvitesStore(state => state.isLoading);
  const fetchInvites = useBoardsInvitesStore(state => state.fetchInvites);
  const acceptInvite = useBoardsInvitesStore(state => state.acceptInvite);
  const rejectInvite = useBoardsInvitesStore(state => state.rejectInvite);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuth) return;
    fetchInvites();
  }, [fetchInvites, isInitialized, isAuth]);

  const sortedInvites = useMemo(
    () =>
      [...invites].sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      }),
    [invites]
  );

  return (
    <div className={classes.root}>
      <h2>Приглашения в доски:</h2>

      {!isInitialized ? null : !isAuth ? (
        <div className={classes.empty}>
          <h3>Войдите чтобы увидеть приглашения в доски</h3>
          <Mainbtn variant="mini" text="Войти" />
        </div>
      ) : isLoading ? (
        <p>Загрузка приглашений...</p>
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
