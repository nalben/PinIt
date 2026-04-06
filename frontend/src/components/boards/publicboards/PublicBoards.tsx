import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import classes from './PublicBoards.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { useCreateBoardModalStore } from '@/store/createBoardModalStore';
import { UnifiedBoard, useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';

const PublicBoards: React.FC = () => {
  const isAuth = useAuthStore((s) => s.isAuth);
  const openCreateBoardModal = useCreateBoardModalStore((s) => s.open);
  const boards = useBoardsUnifiedStore((s) => s.publicBoards);
  const isLoading = useBoardsUnifiedStore((s) => s.isLoadingPublic);
  const hasLoadedOnce = useBoardsUnifiedStore((s) => s.hasLoadedOncePublic);
  const ensureLoaded = useBoardsUnifiedStore((s) => s.ensurePublicLoaded);

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
    setHasListScroll((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onResize = () => {
      const el = boardsListRef.current;
      if (!el) return;
      const next = el.scrollHeight > el.clientHeight + 1;
      setHasListScroll((prev) => (prev === next ? prev : next));
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
      addFakePublicBoards?: () => void;
      setFakePublicBoards?: (boards: UnifiedBoard[]) => void;
      clearFakePublicBoards?: () => void;
    };

    w.addFakePublicBoards = () => {
      const now = new Date().toISOString();
      const fakeBoards: UnifiedBoard[] = Array.from({ length: 6 }).map((_, i) => ({
        id: i + 1,
        title: `Fake public board ${i + 1}`,
        description: `Fake description ${i + 1}`,
        created_at: now,
        image: null,
      }));
      setDebugBoards(fakeBoards);
    };

    w.setFakePublicBoards = (nextBoards) => {
      setDebugBoards(Array.isArray(nextBoards) ? nextBoards : []);
    };

    w.clearFakePublicBoards = () => {
      setDebugBoards(null);
    };

    return () => {
      delete w.addFakePublicBoards;
      delete w.setFakePublicBoards;
      delete w.clearFakePublicBoards;
    };
  }, []);

  useEffect(() => {
    if (forceSkeleton) return;
    if (debugBoards !== null) return;

    ensureLoaded();
  }, [forceSkeleton, debugBoards, ensureLoaded]);

  const skeleton = (
    <section className={classes.boards_container} aria-busy="true">
      <h2>Популярные публичные доски:</h2>
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

  if (forceSkeleton) return skeleton;
  if (!isDebug && (isLoading || !hasLoadedOnce) && boards.length === 0) return skeleton;

  return (
    <section className={classes.boards_container}>
      <h2>Популярные публичные доски:</h2>
      {boardsToRender.length > 0 ? (
        <div
          ref={boardsListRef}
          className={`${classes.boards_list} ${hasListScroll ? classes.boards_list_scroll : ''}`}
        >
          {boardsToRender.map((board) => {
            const imgSrc = board.image
              ? board.image.startsWith('/uploads/')
                ? `${API_URL}${board.image}`
                : board.image
              : null;

            return (
              <div key={board.id} className={classes.boards_item}>
                <Link
                  to={`/spaces/${board.id}`}
                  state={{ board }}
                  className={classes.board_cover_link}
                  aria-label={`Открыть доску ${board.title}`}
                >
                  {imgSrc ? <img src={imgSrc} alt={board.title} /> : <Default />}
                </Link>

                <div className={classes.board_info_con}>
                  <Link to={`/spaces/${board.id}`} state={{ board }} className={classes.board_title_link}>
                    <h3>{board.title}</h3>
                  </Link>
                  <p>{board.description || ''}</p>
                </div>

                <Mainbtn
                  variant="mini"
                  kind="navlink"
                  href={`/spaces/${board.id}`}
                  state={{ board }}
                  text="Открыть"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.boards_empty}>
          <h3>Открытых досок не найдено</h3>
          {isAuth ? (
            <Mainbtn variant="mini" text="Создать доску" onClick={openCreateBoardModal} />
          ) : (
            <AuthTrigger type="login">
              <Mainbtn variant="mini" text="Создать доску" />
            </AuthTrigger>
          )}
        </div>
      )}
    </section>
  );
};

export default PublicBoards;
