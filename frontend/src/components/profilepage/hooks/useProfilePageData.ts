import { useCallback, useEffect, useState } from 'react';
import axiosInstance from '@/api/axiosInstance';
import { connectSocket } from '@/services/socketManager';
import { safeCopyToClipboard } from '../utils/clipboard';
import type { FriendStatus, FriendStatusEntry, ProfileCacheEntry, ProfileCacheKey, ProfileData, ProfileError } from '../model';

const profileCache = new Map<ProfileCacheKey, ProfileCacheEntry>();
const profileInFlight = new Map<ProfileCacheKey, Promise<ProfileCacheEntry>>();
const friendCountInFlight = new Map<string, boolean>();
const friendStatusCache = new Map<number, FriendStatusEntry>();
const friendStatusInFlight = new Map<number, boolean>();

const getCacheKey = (username: string, hasToken: boolean): ProfileCacheKey => `${username}|${hasToken ? 'auth' : 'anon'}`;

export const useProfilePageData = (params: {
  username?: string;
  isInitialized: boolean;
  hasToken: boolean;
  openHeaderDropdown: (name: string) => void;
  setHighlightRequestId: (id: number | null) => void;
}) => {
  const { username, isInitialized, hasToken, openHeaderDropdown, setHighlightRequestId } = params;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProfileFriendStatusLoading, setIsProfileFriendStatusLoading] = useState<boolean>(false);
  const [friendStatusById, setFriendStatusById] = useState<Record<number, FriendStatusEntry>>({});
  const [shareTextById, setShareTextById] = useState<Record<number, string>>({});

  const clearProfileCacheForUsername = useCallback((value?: string) => {
    if (!value) return;
    profileCache.delete(`${value}|auth`);
    profileCache.delete(`${value}|anon`);
  }, []);

  const setFriendStatusForUser = useCallback((userId: number, status: FriendStatusEntry) => {
    friendStatusCache.set(userId, status);
    setFriendStatusById((prev) => ({ ...prev, [userId]: status }));
    setIsProfileFriendStatusLoading(false);
  }, []);

  const requestFriendStatus = useCallback(
    async (userId: number, isMounted?: () => boolean) => {
      if (!Number.isFinite(userId) || userId <= 0) return;

      const cached = friendStatusCache.get(userId);
      if (cached) {
        if (!isMounted || isMounted()) {
          setFriendStatusById((prev) => ({ ...prev, [userId]: cached }));
          setIsProfileFriendStatusLoading(false);
        }
        return;
      }

      if (friendStatusInFlight.get(userId)) {
        if (!isMounted || isMounted()) setIsProfileFriendStatusLoading(true);
        return;
      }
      friendStatusInFlight.set(userId, true);
      if (!isMounted || isMounted()) setIsProfileFriendStatusLoading(true);

      try {
        const { data } = await axiosInstance.get<{ status: FriendStatus; requestId?: number }>(`/api/friends/status/${userId}`);
        const next: FriendStatusEntry = { status: data.status, requestId: data.requestId };
        friendStatusCache.set(userId, next);
        if (!isMounted || isMounted()) {
          setFriendStatusById((prev) => ({ ...prev, [userId]: next }));
        }
      } catch {
        // ignore
      } finally {
        friendStatusInFlight.delete(userId);
        if (!isMounted || isMounted()) setIsProfileFriendStatusLoading(false);
      }
    },
    []
  );

  const refreshFriendCount = useCallback(async () => {
    if (!username) return;
    if (friendCountInFlight.get(username)) return;
    try {
      friendCountInFlight.set(username, true);
      const { data } = await axiosInstance.get<{ friend_count: number }>(`/api/profile/${username}/friends-count`);
      setFriendCount(data.friend_count);
    } catch (err) {
      console.error('Ошибка при обновлении количества друзей', err);
    } finally {
      friendCountInFlight.delete(username);
    }
  }, [username]);

  useEffect(() => {
    if (!isInitialized || !username) return;

    const cacheKey = getCacheKey(username, hasToken);
    const cached = profileCache.get(cacheKey);

    if (cached) {
      setError(null);
      setProfile(cached.profile);
      setFriendCount(cached.friendCount);
      setIsLoading(false);

      if (hasToken && !cached.profile.isOwner) {
        setIsProfileFriendStatusLoading(!friendStatusCache.has(cached.profile.id));
        void requestFriendStatus(cached.profile.id);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setProfile(null);
    setFriendCount(null);
    setIsProfileFriendStatusLoading(false);
    setFriendStatusById({});
    setShareTextById({});

    let mounted = true;
    const isMounted = () => mounted;

    const promise =
      profileInFlight.get(cacheKey) ??
      (async () => {
        const [{ data: profileData }, { data: count }] = await Promise.all([
          axiosInstance.get<ProfileData>(`/api/profile/${username}`),
          axiosInstance.get<{ friend_count: number }>(`/api/profile/${username}/friends-count`),
        ]);

        const entry: ProfileCacheEntry = {
          profile: profileData,
          friendCount: typeof count?.friend_count === 'number' ? count.friend_count : null,
        };

        profileCache.set(cacheKey, entry);
        return entry;
      })();

    if (!profileInFlight.has(cacheKey)) {
      profileInFlight.set(
        cacheKey,
        promise.then(
          (value) => {
            profileInFlight.delete(cacheKey);
            return value;
          },
          (err) => {
            profileInFlight.delete(cacheKey);
            throw err;
          }
        )
      );
    }

    profileInFlight
      .get(cacheKey)!
      .then((entry) => {
        if (!mounted) return;
        setProfile(entry.profile);
        setFriendCount(entry.friendCount);

        if (hasToken && !entry.profile.isOwner) {
          setIsProfileFriendStatusLoading(!friendStatusCache.has(entry.profile.id));
          void requestFriendStatus(entry.profile.id, isMounted);
        }
      })
      .catch((err: any) => {
        if (!mounted) return;
        if (err?.response?.status === 404) {
          setError('NOT_FOUND');
          return;
        }
        setError('UNKNOWN');
        console.error(err);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [hasToken, isInitialized, requestFriendStatus, username]);

  useEffect(() => {
    if (!profile?.id) return;

    const handleFriendStatusChange = (data: { userId: number; status: FriendStatus; requestId?: number }) => {
      if (!Number.isFinite(data?.userId)) return;
      setFriendStatusForUser(data.userId, {
        status: data.status,
        requestId: data.requestId ?? friendStatusCache.get(data.userId)?.requestId,
      });

      const shouldUpdateCounts = profile.isOwner || profile.id === data.userId;
      if (!shouldUpdateCounts) return;
      clearProfileCacheForUsername(username);
      void refreshFriendCount();
    };

    const handleNewRequest = (data: { user_id?: unknown; id?: unknown }) => {
      const userId = Number(data?.user_id);
      const requestId = Number(data?.id);
      if (!Number.isFinite(userId) || !Number.isFinite(requestId)) return;
      setFriendStatusForUser(userId, { status: 'received', requestId });
    };

    const handleRemoveRequest = (data: { id: number }) => {
      setFriendStatusById((prev) => {
        const updated = { ...prev };
        for (const key in updated) {
          if (updated[key].requestId !== data.id) continue;
          updated[key] = { status: updated[key].status === 'friend' ? 'friend' : 'none' };
          const numericKey = Number(key);
          if (Number.isFinite(numericKey)) {
            friendStatusCache.set(numericKey, { status: updated[key].status });
          }
        }
        return updated;
      });
    };

    const unsubscribe = connectSocket({
      onFriendStatusChange: handleFriendStatusChange,
      onNewRequest: handleNewRequest,
      onRemoveRequest: handleRemoveRequest,
    });

    return () => {
      unsubscribe?.();
    };
  }, [clearProfileCacheForUsername, profile?.id, profile?.isOwner, refreshFriendCount, setFriendStatusForUser, username]);

  const handleShare = useCallback((userId: number, profileUsername: string) => {
    const profileUrl = `${window.location.origin}/user/${profileUsername}`;
    safeCopyToClipboard(profileUrl)
      .then(() => {
        setShareTextById((prev) => ({ ...prev, [userId]: 'Скопировано' }));
        setTimeout(() => {
          setShareTextById((prev) => ({ ...prev, [userId]: 'Поделиться' }));
        }, 2000);
      })
      .catch((err) => console.error('Ошибка копирования в буфер:', err));
  }, []);

  const handleFriendAction = useCallback(
    async (userId: number) => {
      const current = friendStatusById[userId]?.status ?? 'none';
      const requestId = friendStatusById[userId]?.requestId;

      try {
        if (current === 'received') {
          openHeaderDropdown('notifications');
          if (requestId) setHighlightRequestId(requestId);
          return;
        }

        if (current === 'friend') {
          await axiosInstance.delete(`/api/friends/${userId}`);
          setFriendStatusForUser(userId, { status: 'none' });
          return;
        }

        if (current === 'none') {
          if (friendStatusById[userId]?.status === 'sent' || friendStatusById[userId]?.status === 'rejected') return;
          const { data } = await axiosInstance.post<{ id: number }>(`/api/friends/send`, { friend_id: userId });
          setFriendStatusForUser(userId, { status: 'sent', requestId: data.id });
          return;
        }

        if (current === 'sent' && requestId) {
          await axiosInstance.delete(`/api/friends/remove-request/${requestId}`);
          setFriendStatusForUser(userId, { status: 'none' });
        }
      } catch (err) {
        console.error(err);
      }
    },
    [friendStatusById, openHeaderDropdown, setFriendStatusForUser, setHighlightRequestId]
  );

  const profileFriendStatus = profile ? friendStatusById[profile.id]?.status ?? 'none' : 'none';

  return {
    profile,
    setProfile,
    error,
    friendCount,
    isLoading,
    friendStatusById,
    shareTextById,
    profileFriendStatus,
    isProfileFriendStatusLoading,
    refreshFriendCount,
    handleShare,
    handleFriendAction,
    clearProfileCacheForUsername,
  };
};
