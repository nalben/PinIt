import React, { useEffect, useState } from 'react';
import { API_URL } from '@/api/axiosInstance';
import Mainbtn from '../_UI/mainbtn/Mainbtn';
import classes from './Lastdesks.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import { useBoardsStore } from '@/store/boardsStore';
import AuthTrigger from '../auth/AuthTrigger';
import { useAuthStore } from '@/store/authStore';

// Zustand store для последних досок
const Lastdesks: React.FC = () => {
  const recentBoards = useBoardsStore(state => state.recentBoards);
  const isLoading = useBoardsStore(state => state.isLoading);
  const loadBoards = useBoardsStore(state => state.loadBoards);
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
      <section className={classes.desks_container} aria-busy="true">
        <h2>Последние открытые доски:</h2>
        <div className={classes.desks_list}>
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className={classes.desks_item}>
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

  return (
    <section className={classes.desks_container}>
      <h2>Последние открытые доски:</h2>
      {recentBoards.length > 0 ? (
        <div className={classes.desks_list}>
          {recentBoards.slice(0, 3).map(board => {
            const imgSrc = board.image
              ? board.image.startsWith('/uploads/')
                ? `${API_URL}${board.image}`
                : board.image
              : null;

            return (
              <div key={board.id} className={classes.desks_item}>
                {imgSrc ? <img src={imgSrc} alt={board.title} /> : <Default />}
                <div className={classes.board_info_con}>
                  <h3>{board.title}</h3>
                  <p>{board.description || 'Нет описания'}</p>
                </div>
                <Mainbtn variant="mini" text="Открыть" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.desks_empty}>
          <h3>Досок не найдено</h3>
          <AuthTrigger type='login'>
            <Mainbtn variant="mini" text="Создать доску" />
          </AuthTrigger>
        </div>
      )}
    </section>
  );
};

export default Lastdesks;
