export interface ProfileData {
  id: number;
  avatar?: string | null;
  role: string;
  isOwner: boolean;
  username: string;
  created_at: string;
  nickname?: string | null;
  status?: string | null;
  friend_code?: string | null;
}

export interface UpdateProfileResponse {
  message: string;
  user: ProfileData;
}

export type FriendStatus = 'friend' | 'none' | 'sent' | 'rejected' | 'received';
export type ProfileError = 'NOT_FOUND' | 'UNKNOWN';
export type OpenModal = 'edit' | 'reset' | null;

export type FriendStatusEntry = { status: FriendStatus; requestId?: number };
export type ProfileCacheKey = string;
export type ProfileCacheEntry = { profile: ProfileData; friendCount: number | null };
