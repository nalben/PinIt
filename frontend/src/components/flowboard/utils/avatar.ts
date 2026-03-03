import { API_URL } from '@/api/axiosInstance';

export const resolveAvatarSrc = (avatar?: string | null) => {
  if (!avatar) return null;
  if (avatar.startsWith('/uploads/')) return `${API_URL}${avatar}`;
  return avatar;
};

