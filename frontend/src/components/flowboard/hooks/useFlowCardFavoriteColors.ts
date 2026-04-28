import { useCallback, useEffect, useRef, useState } from 'react';
import axiosInstance from '@/api/axiosInstance';

type FavoriteColorsResponse = {
  colors?: unknown;
};

const FAVORITE_COLORS_SYNC_EVENT = 'pinit:favorite-card-colors-sync';

const normalizeColors = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  raw.forEach((value) => {
    if (typeof value !== 'string') return;
    const color = value.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(color) || seen.has(color)) return;
    seen.add(color);
    result.push(color);
  });

  return result;
};

export const useFlowCardFavoriteColors = (params: {
  numericBoardId: number;
  hasToken: boolean;
  onError: (message: string, error?: unknown) => void;
}) => {
  const { numericBoardId, hasToken, onError } = params;
  const [favoriteColors, setFavoriteColors] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const applyResponse = useCallback((data: FavoriteColorsResponse | null | undefined) => {
    const colors = normalizeColors(data?.colors);
    setFavoriteColors(colors);
    hasLoadedRef.current = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(FAVORITE_COLORS_SYNC_EVENT, {
          detail: { boardId: numericBoardId, colors },
        })
      );
    }
    return colors;
  }, [numericBoardId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ boardId?: unknown; colors?: unknown }>).detail;
      const boardId = Number(detail?.boardId);
      if (!Number.isFinite(boardId) || boardId !== numericBoardId) return;
      const colors = normalizeColors(detail?.colors);
      setFavoriteColors(colors);
      hasLoadedRef.current = true;
    };

    window.addEventListener(FAVORITE_COLORS_SYNC_EVENT, onSync as EventListener);
    return () => window.removeEventListener(FAVORITE_COLORS_SYNC_EVENT, onSync as EventListener);
  }, [numericBoardId]);

  const fetchFavoriteColors = useCallback(async () => {
    if (!hasToken) {
      hasLoadedRef.current = true;
      setFavoriteColors([]);
      return [];
    }

    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) {
      return favoriteColors;
    }

    setFavoritesLoading(true);
    try {
      const res = await axiosInstance.get<FavoriteColorsResponse>(`/api/boards/${numericBoardId}/cards/favorite-colors`);
      return applyResponse(res.data);
    } catch (error) {
      onError('Не удалось загрузить избранные цвета.', error);
      return favoriteColors;
    } finally {
      setFavoritesLoading(false);
    }
  }, [applyResponse, favoriteColors, hasToken, numericBoardId, onError]);

  const ensureFavoriteColorsLoaded = useCallback(async () => {
    if (hasLoadedRef.current) return favoriteColors;
    return fetchFavoriteColors();
  }, [favoriteColors, fetchFavoriteColors]);

  const addFavoriteColor = useCallback(
    async (color: string) => {
      if (!hasToken || !Number.isFinite(numericBoardId) || numericBoardId <= 0) return favoriteColors;

      setFavoritesLoading(true);
      try {
        const res = await axiosInstance.post<FavoriteColorsResponse>(`/api/boards/${numericBoardId}/cards/favorite-colors`, { color });
        return applyResponse(res.data);
      } catch (error) {
        onError('Не удалось сохранить цвет в избранное.', error);
        return favoriteColors;
      } finally {
        setFavoritesLoading(false);
      }
    },
    [applyResponse, favoriteColors, hasToken, numericBoardId, onError]
  );

  const removeFavoriteColor = useCallback(
    async (color: string) => {
      if (!hasToken || !Number.isFinite(numericBoardId) || numericBoardId <= 0) return favoriteColors;

      setFavoritesLoading(true);
      try {
        const encoded = encodeURIComponent(color);
        const res = await axiosInstance.delete<FavoriteColorsResponse>(`/api/boards/${numericBoardId}/cards/favorite-colors/${encoded}`);
        return applyResponse(res.data);
      } catch (error) {
        onError('Не удалось удалить цвет из избранного.', error);
        return favoriteColors;
      } finally {
        setFavoritesLoading(false);
      }
    },
    [applyResponse, favoriteColors, hasToken, numericBoardId, onError]
  );

  const resetFavoriteColors = useCallback(() => {
    hasLoadedRef.current = false;
    setFavoriteColors([]);
    setFavoritesLoading(false);
  }, []);

  return {
    favoriteColors,
    favoritesLoading,
    ensureFavoriteColorsLoaded,
    addFavoriteColor,
    removeFavoriteColor,
    resetFavoriteColors,
  };
};
