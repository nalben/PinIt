import React, { useEffect, useState } from 'react';
import { API_URL } from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import classes from './Lastboards.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import { useBoardsStore } from '@/store/boardsStore';
import { useCreateBoardModalStore } from '@/store/createBoardModalStore';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { useAuthStore } from '@/store/authStore';

// Zustand store для последних досок
const Lastboards: React.FC = () => {
  const recentBoards = useBoardsStore(state => state.recentBoards);
  const isLoading = useBoardsStore(state => state.isLoading);
  const loadBoards = useBoardsStore(state => state.loadBoards);
  const openCreateBoardModal = useCreateBoardModalStore((s) => s.open);
  const isAuth = useAuthStore(state => state.isAuth);
  const isInitialized = useAuthStore(state => state.isInitialized);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useEffect(() => {
    if (forceSkeleton) {
      setHasLoadedOnce(false);
      return;
    }
    if (!isInitialized) return;
    let mounted = true;
    setHasLoadedOnce(false);
    loadBoards().finally(() => {
      if (!mounted) return;
      setHasLoadedOnce(true);
    });

    return () => {
      mounted = false;
    };
  }, [loadBoards, forceSkeleton, isInitialized, isAuth]);

  if (forceSkeleton || ((isLoading || !hasLoadedOnce) && recentBoards.length === 0)) {
    return (
      <section className={classes.boards_container} aria-busy="true">
        <h2>Последние открытые доски:</h2>
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
  }

  const accessibleBoards = recentBoards.filter((board) => {
    const isPublic = Boolean(board.is_public);
    if (isPublic) return true;
    if (!isAuth) return false;
    return Boolean(board.my_role);
  });

  return (
    <section className={classes.boards_container}>
      <h2>Последние открытые доски:</h2>
      {accessibleBoards.length > 0 ? (
        <div className={classes.boards_list}>
          {accessibleBoards.slice(0, 3).map(board => {
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
                <Mainbtn variant="mini" kind="navlink" href={`/spaces/${board.id}`} text="Открыть" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.boards_empty}>
          <h3>Досок не найдено</h3>
          {isAuth ? (
            <Mainbtn variant="mini" text="Создать доску" onClick={openCreateBoardModal} />
          ) : (
            <AuthTrigger type='login'>
              <Mainbtn variant="mini" text="Создать доску" />
            </AuthTrigger>
          )}
        </div>
      )}
    </section>
  );
};

export default Lastboards;
