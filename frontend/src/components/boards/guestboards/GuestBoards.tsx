import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import classes from './GuestBoards.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { useCreateBoardModalStore } from '@/store/createBoardModalStore';
import { UnifiedBoard, useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';

const GuestBoards: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const openCreateBoardModal = useCreateBoardModalStore((s) => s.open);
  const boards = useBoardsUnifiedStore((s) => s.guestBoards);
  const isLoading = useBoardsUnifiedStore((s) => s.isLoadingGuest);
  const hasLoadedOnce = useBoardsUnifiedStore((s) => s.hasLoadedOnceGuest);
  const ensureLoaded = useBoardsUnifiedStore((s) => s.ensureGuestLoaded);

  const [debugBoards, setDebugBoards] = useState<UnifiedBoard[] | null>(null);
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
      addFakeGuestBoards?: () => void;
      setFakeGuestBoards?: (boards: UnifiedBoard[]) => void;
      clearFakeGuestBoards?: () => void;
    };

    w.addFakeGuestBoards = () => {
      const now = new Date().toISOString();
      const fakeBoards: UnifiedBoard[] = Array.from({ length: 6 }).map((_, i) => ({
        id: i + 1,
        title: `Fake guest board ${i + 1}`,
        description: `Fake description ${i + 1}`,
        created_at: now,
        image: null,
        my_role: 'guest',
        last_visited_at: null,
      }));
      setDebugBoards(fakeBoards);
    };

    w.setFakeGuestBoards = (nextBoards) => {
      setDebugBoards(Array.isArray(nextBoards) ? nextBoards : []);
    };

    w.clearFakeGuestBoards = () => {
      setDebugBoards(null);
    };

    return () => {
      delete w.addFakeGuestBoards;
      delete w.setFakeGuestBoards;
      delete w.clearFakeGuestBoards;
    };
  }, []);

  useEffect(() => {
    if (forceSkeleton) return;
    if (debugBoards !== null) return;
    if (!isInitialized) return;
    if (!isAuth) return;
    ensureLoaded();
  }, [debugBoards, ensureLoaded, forceSkeleton, isAuth, isInitialized]);

  const skeleton = (
    <section className={classes.boards_container} aria-busy="true">
      <h2>Гостевые доски:</h2>
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
        <h2>Гостевые доски:</h2>
        <div className={classes.boards_empty}>
          <h3>Войдите, чтобы увидеть гостевые доски</h3>
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
      <h2>Гостевые доски:</h2>
      {boardsToRender.length > 0 ? (
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
      ) : (
        <div className={classes.boards_empty}>
          <h3>Вы еще не вошли ни в одну доску как гость</h3>
          <Mainbtn variant="mini" text="Создать доску" onClick={openCreateBoardModal} />
        </div>
      )}
    </section>
  );
};

export default GuestBoards;
