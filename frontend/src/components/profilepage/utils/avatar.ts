import { API_URL } from '@/api/axiosInstance';
import type { ProfileData } from '../model';

export const resolveProfileAvatarPath = (avatar?: string | null) => {
  if (!avatar) return null;
  if (avatar.startsWith('/uploads/')) return `${API_URL}${avatar}`;
  return `${API_URL}/uploads/${avatar}`;
};

export const resolveProfileAvatarSrc = (params: {
  profile: ProfileData;
  authAvatar?: string | null;
}) => {
  const { profile, authAvatar } = params;
  if (profile.isOwner && authAvatar) return resolveProfileAvatarPath(authAvatar);
  return resolveProfileAvatarPath(profile.avatar);
};
