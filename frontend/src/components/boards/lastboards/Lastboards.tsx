import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import classes from './Lastboards.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import { RECENT_BOARDS_LS_KEY, UnifiedBoard, useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';
import { useCreateBoardModalStore } from '@/store/createBoardModalStore';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { useAuthStore } from '@/store/authStore';

const Lastboards: React.FC = () => {
  const recentBoards = useBoardsUnifiedStore((s) => s.recentBoards);
  const isLoading = useBoardsUnifiedStore((s) => s.isLoadingRecent);
  const hasLoadedOnce = useBoardsUnifiedStore((s) => s.hasLoadedOnceRecent);
  const ensureRecentLoaded = useBoardsUnifiedStore((s) => s.ensureRecentLoaded);
  const refreshRecentSilent = useBoardsUnifiedStore((s) => s.refreshRecentSilent);
  const openCreateBoardModal = useCreateBoardModalStore((s) => s.open);
  const isAuth = useAuthStore((state) => state.isAuth);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const prevIsAuthRef = useRef(isAuth);
  const forceSkeleton =
    __ENV__ === 'development' &&
    typeof window !== 'undefined' &&
    localStorage.getItem('debugSkeleton') === '1';

  useEffect(() => {
    if (!isInitialized) return;
    if (isAuth) return;

    const readCurrent = (): UnifiedBoard[] => {
      try {
        const raw = localStorage.getItem(RECENT_BOARDS_LS_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as UnifiedBoard[]) : [];
      } catch {
        return [];
      }
    };

    let cancelled = false;
    const current = readCurrent();
    if (current.length === 0) {
      useBoardsUnifiedStore.setState((s) => ({
        ...s,
        recentIds: [],
        recentBoards: [],
        hasLoadedOnceRecent: true,
        isLoadingRecent: false,
      }));
      return;
    }

    const normalizePublicEntry = (existing: UnifiedBoard, patch: Partial<UnifiedBoard>): UnifiedBoard => ({
      ...existing,
      ...patch,
      id: existing.id,
      is_public: true,
    });

    Promise.all(
      current.map(async (b) => {
        const id = Number(b?.id);
        if (!Number.isFinite(id) || id <= 0) return null;

        try {
          const { data } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/public/${id}`);
          const title = typeof data?.title === 'string' && data.title.trim() ? data.title : b.title;
          if (!title) return null;

          const description = typeof data?.description === 'string' || data?.description === null ? data.description : b.description ?? null;
          const image = typeof data?.image === 'string' || data?.image === null ? data.image : b.image ?? null;
          const created_at = typeof data?.created_at === 'string' ? data.created_at : b.created_at;

          return normalizePublicEntry(b, { title, description, image, created_at });
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const publicOnly = results.filter((x): x is UnifiedBoard => Boolean(x));

      try {
        localStorage.setItem(RECENT_BOARDS_LS_KEY, JSON.stringify(publicOnly));
      } catch {
        // ignore
      }

      useBoardsUnifiedStore.setState((s) => {
        const nextEntities = { ...s.entitiesById };
        const nextIds: number[] = [];
        for (const b of publicOnly) {
          const id = Number(b.id);
          if (!Number.isFinite(id) || id <= 0) continue;
          nextIds.push(id);
          nextEntities[id] = { ...(nextEntities[id] ?? b), ...b, id };
        }
        return {
          ...s,
          entitiesById: nextEntities,
          recentIds: nextIds,
          recentBoards: publicOnly,
          hasLoadedOnceRecent: true,
          isLoadingRecent: false,
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isAuth, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    if (forceSkeleton) return;
    ensureRecentLoaded();
  }, [ensureRecentLoaded, forceSkeleton, isInitialized]);

  useEffect(() => {
    if (!isInitialized) {
      prevIsAuthRef.current = isAuth;
      return;
    }
    if (forceSkeleton) {
      prevIsAuthRef.current = isAuth;
      return;
    }

    if (isAuth && !prevIsAuthRef.current) {
      refreshRecentSilent();
    }

    prevIsAuthRef.current = isAuth;
  }, [forceSkeleton, isAuth, isInitialized, refreshRecentSilent]);

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
          {accessibleBoards.slice(0, 3).map((board) => {
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
          <h3>Досок не найдено</h3>
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

export default Lastboards;
