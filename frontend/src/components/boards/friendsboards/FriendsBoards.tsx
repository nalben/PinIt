import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import classes from './FriendsBoards.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { API_URL } from '@/api/axiosInstance';
import { connectSocket } from '@/services/socketManager';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { FriendsBoard, useSpacesBoardsStore } from '@/store/spacesBoardsStore';

const FriendsBoards: React.FC = () => {
  const { isAuth, isInitialized } = useAuthStore();
  const openFriendsModal = useUIStore((s) => s.openFriendsModal);
  const boards = useSpacesBoardsStore((s) => s.friendsBoards);
  const isLoading = useSpacesBoardsStore((s) => s.isLoadingFriendsBoards);
  const hasLoadedOnce = useSpacesBoardsStore((s) => s.hasLoadedOnceFriendsBoards);
  const ensureLoaded = useSpacesBoardsStore((s) => s.ensureFriendsBoardsLoaded);
  const refresh = useSpacesBoardsStore((s) => s.refreshFriendsBoards);
  const clear = useSpacesBoardsStore((s) => s.clearFriendsBoards);

  const [debugBoards, setDebugBoards] = useState<FriendsBoard[] | null>(null);
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
      addFakeFriendsBoards?: () => void;
      setFakeFriendsBoards?: (boards: FriendsBoard[]) => void;
      clearFakeFriendsBoards?: () => void;
    };

    w.addFakeFriendsBoards = () => {
      const now = new Date().toISOString();
      const fakeBoards: FriendsBoard[] = Array.from({ length: 6 }).map((_, i) => ({
        id: i + 1,
        title: `Fake friend board ${i + 1}`,
        description: `Fake description ${i + 1}`,
        created_at: now,
        image: null,
      }));
      setDebugBoards(fakeBoards);
    };

    w.setFakeFriendsBoards = (nextBoards) => {
      setDebugBoards(Array.isArray(nextBoards) ? nextBoards : []);
    };

    w.clearFakeFriendsBoards = () => {
      setDebugBoards(null);
    };

    return () => {
      delete w.addFakeFriendsBoards;
      delete w.setFakeFriendsBoards;
      delete w.clearFakeFriendsBoards;
    };
  }, []);

  useEffect(() => {
    if (forceSkeleton) return;
    if (debugBoards !== null) return;
    if (!isInitialized) return;
    if (!isAuth) {
      clear();
      return;
    }

    ensureLoaded();
  }, [isAuth, isInitialized, forceSkeleton, debugBoards, ensureLoaded, clear]);

  useEffect(() => {
    if (forceSkeleton) return;
    if (debugBoards !== null) return;
    if (!isInitialized) return;
    if (!isAuth) return;

    const unsubscribe = connectSocket({
      onBoardsUpdate: () => {
        refresh();
      },
    });

    return () => {
      unsubscribe?.();
    };
  }, [isAuth, isInitialized, forceSkeleton, debugBoards, refresh]);

  const skeleton = (
    <section className={classes.boards_container} aria-busy="true">
      <h2>Доски ваших друзей:</h2>
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

  if (!isDebug && (isLoading || !hasLoadedOnce) && boards.length === 0) return skeleton;

  return (
    <section className={classes.boards_container}>
      <h2>Доски ваших друзей:</h2>
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
          <h3>Досок друзей не найдено</h3>
          <Mainbtn variant="mini" text="Добавить друзей" onClick={() => openFriendsModal('search')} />
        </div>
      )}
    </section>
  );
};

export default FriendsBoards;
