import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import classes from './MyBoards.module.scss';
import { API_URL } from '@/api/axiosInstance';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import { Board, useBoardsStore } from '@/store/boardsStore';
import { useCreateBoardModalStore } from '@/store/createBoardModalStore';
import { useAuthStore } from '@/store/authStore';
import AuthTrigger from '@/components/auth/AuthTrigger';

const MyBoards: React.FC = () => {
  const boards = useBoardsStore(state => state.boards);
  const isLoading = useBoardsStore(state => state.isLoading);
  const ensureBoardsLoaded = useBoardsStore(state => state.ensureBoardsLoaded);
  const openCreateBoardModal = useCreateBoardModalStore((s) => s.open);
  const { isAuth, isInitialized } = useAuthStore();
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [debugBoards, setDebugBoards] = useState<Board[] | null>(null);
  const boardsListRef = useRef<HTMLDivElement | null>(null);
  const [hasListScroll, setHasListScroll] = useState(false);
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useLayoutEffect(() => {
    const el = boardsListRef.current;
    if (!el) return;
    const next = el.scrollHeight > el.clientHeight + 1;
    setHasListScroll(prev => (prev === next ? prev : next));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onResize = () => {
      const el = boardsListRef.current;
      if (!el) return;
      const next = el.scrollHeight > el.clientHeight + 1;
      setHasListScroll(prev => (prev === next ? prev : next));
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (__ENV__ !== 'development') return;
    if (typeof window === 'undefined') return;

    const w = window as unknown as {
      addFakeMyBoards?: () => void;
      setFakeMyBoards?: (boards: Board[]) => void;
      clearFakeMyBoards?: () => void;
    };

    w.addFakeMyBoards = () => {
      const now = new Date().toISOString();
      const fakeBoards: Board[] = Array.from({ length: 6 }).map((_, i) => ({
        id: i + 1,
        title: `Fake board ${i + 1}`,
        description: `Fake description ${i + 1}`,
        created_at: now
      }));
      setDebugBoards(fakeBoards);
      setHasLoadedOnce(true);
    };

    w.setFakeMyBoards = (nextBoards) => {
      setDebugBoards(Array.isArray(nextBoards) ? nextBoards : []);
      setHasLoadedOnce(true);
    };

    w.clearFakeMyBoards = () => {
      setDebugBoards(null);
    };

    return () => {
      delete w.addFakeMyBoards;
      delete w.setFakeMyBoards;
      delete w.clearFakeMyBoards;
    };
  }, []);

  useEffect(() => {
    if (forceSkeleton) return;
    if (debugBoards !== null) return;
    if (!isInitialized) return;
    if (!isAuth) {
      setHasLoadedOnce(false);
      return;
    }

    let mounted = true;
    setHasLoadedOnce(false);
    ensureBoardsLoaded().finally(() => {
      if (!mounted) return;
      setHasLoadedOnce(true);
    });

    return () => {
      mounted = false;
    };
  }, [ensureBoardsLoaded, forceSkeleton, isInitialized, isAuth, debugBoards]);

  const skeleton = (
    <section className={classes.boards_container} aria-busy="true">
      <h2>Ваши доски:</h2>
      <div
        ref={boardsListRef}
        className={`${classes.boards_list} ${hasListScroll ? classes.boards_list_scroll : ''}`}
      >
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

  const boardsToRender = debugBoards ?? boards;
  const isDebug = debugBoards !== null;

  if (forceSkeleton || (!isInitialized && !isDebug)) return skeleton;

  if (!isAuth && !isDebug) {
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

  if (!isDebug && (isLoading || !hasLoadedOnce) && boards.length === 0) return skeleton;

  return (
    <section className={classes.boards_container}>
      <h2>Ваши доски:</h2>
      {boardsToRender.length > 0 ? (
        <>
          <div className={classes.create_board}>
            <Mainbtn variant="mini" text="Создать новую доску" onClick={openCreateBoardModal} />
          </div>
          <div
            ref={boardsListRef}
            className={`${classes.boards_list} ${hasListScroll ? classes.boards_list_scroll : ''}`}
          >
          {boardsToRender.map(board => {
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
        </>
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
