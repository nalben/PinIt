import React, { useEffect, useState } from 'react';
import classes from './MyBoards.module.scss';
import { API_URL } from '@/api/axiosInstance';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import { useBoardsStore } from '@/store/boardsStore';
import { useCreateBoardModalStore } from '@/store/createBoardModalStore';
import { useAuthStore } from '@/store/authStore';
import AuthTrigger from '@/components/auth/AuthTrigger';

const MyBoards: React.FC = () => {
  const boards = useBoardsStore(state => state.boards);
  const isLoading = useBoardsStore(state => state.isLoading);
  const loadBoards = useBoardsStore(state => state.loadBoards);
  const openCreateBoardModal = useCreateBoardModalStore((s) => s.open);
  const { isAuth, isInitialized } = useAuthStore();
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useEffect(() => {
    if (forceSkeleton) return;
    if (!isInitialized) return;
    if (!isAuth) {
      setHasLoadedOnce(false);
      return;
    }

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

  const skeleton = (
    <section className={classes.boards_container} aria-busy="true">
      <h2>Ваши доски:</h2>
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
        <h2>Ваши доски:</h2>
        <div className={classes.boards_empty}>
          <h3>Войдите, чтобы увидеть ваши доски</h3>
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
      <h2>Ваши доски:</h2>
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
          <h3>Досок не найдено</h3>
          <Mainbtn variant="mini" text="Создать доску" onClick={openCreateBoardModal} />
        </div>
      )}
    </section>
  );
};

export default MyBoards;
