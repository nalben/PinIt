import React, { useEffect, useState } from 'react';
import classes from './FriendsBoards.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { API_URL } from '@/api/axiosInstance';
import axiosInstance from '@/api/axiosInstance';
import { connectSocket } from '@/services/socketManager';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

interface FriendBoard {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  image?: string | null;
}

const FriendsBoards: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const openFriendsModal = useUIStore((s) => s.openFriendsModal);
  const [boards, setBoards] = useState<FriendBoard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useEffect(() => {
    if (forceSkeleton) return;
    if (!isInitialized) return;
    if (!isAuth) {
      setBoards([]);
      setHasLoadedOnce(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setHasLoadedOnce(false);
    axiosInstance.get<FriendBoard[]>('/api/boards/friends')
      .then(({ data }) => {
        if (!mounted) return;
        setBoards(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setBoards([]);
      })
      .then(() => {
        if (!mounted) return;
        setIsLoading(false);
        setHasLoadedOnce(true);
      });

    return () => {
      mounted = false;
    };
  }, [isAuth, isInitialized, forceSkeleton]);

  useEffect(() => {
    if (forceSkeleton) return;
    if (!isInitialized) return;
    if (!isAuth) return;

    let mounted = true;

    const unsubscribe = connectSocket({
      onBoardsUpdate: () => {
        setIsLoading(true);
        axiosInstance.get<FriendBoard[]>('/api/boards/friends')
          .then(({ data }) => {
            if (!mounted) return;
            setBoards(Array.isArray(data) ? data : []);
          })
          .catch(() => {
            if (!mounted) return;
            setBoards([]);
          })
          .then(() => {
            if (!mounted) return;
            setIsLoading(false);
            setHasLoadedOnce(true);
          });
      },
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [isAuth, isInitialized, forceSkeleton]);

  const skeleton = (
    <section className={classes.boards_container} aria-busy="true">
      <h2>Доски ваших друзей:</h2>
      <div className={classes.boards_list}>
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className={classes.boards_item}>
            <div className={`${classes.skeleton} ${classes.skeleton_img}`} />
            <div className={classes.board_info_con}>
              <div className={`${classes.skeleton} ${classes.skeleton_line}`} />
              <div className={`${classes.skeleton} ${classes.skeleton_line_sm}`} />
            </div>
            <div className={`${classes.skeleton} ${classes.skeleton_btn}`} />
          </div>
        ))}
      </div>
    </section>
  );

  if (forceSkeleton || !isInitialized) return skeleton;

  if (!isAuth) {
    return (
      <section className={classes.boards_container}>
        <h2>Доски ваших друзей:</h2>
        <div className={classes.boards_empty}>
          <h3>Войдите, чтобы увидеть доски друзей</h3>
          <AuthTrigger type="login">
            <Mainbtn variant="mini" text="Войти" />
          </AuthTrigger>
        </div>
      </section>
    );
  }

  if ((isLoading || !hasLoadedOnce) && boards.length === 0) return skeleton;

  return (
    <section className={classes.boards_container}>
      <h2>Доски ваших друзей:</h2>
      {boards.length > 0 ? (
        <div className={classes.boards_list}>
          {boards.map(board => {
            const imgSrc = board.image
              ? board.image.startsWith('/uploads/')
                ? `${API_URL}${board.image}`
                : board.image
              : null;

            return (
              <div key={board.id} className={classes.boards_item}>
                {imgSrc ? <img src={imgSrc} alt={board.title} /> : <Default />}
                <div className={classes.board_info_con}>
                  <h3>{board.title}</h3>
                  <p>{board.description || ''}</p>
                </div>
                <Mainbtn variant="mini" text="Открыть" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.boards_empty}>
          <h3>Досок друзей не найдено</h3>
          <Mainbtn variant="mini" text="Добавить друзей" onClick={() => openFriendsModal('search')} />
        </div>
      )}
    </section>
  );
};

export default FriendsBoards;
