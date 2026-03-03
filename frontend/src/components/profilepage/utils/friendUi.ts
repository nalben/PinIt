import type { FriendStatus } from '../model';

export const getFriendButtonText = (status: FriendStatus) => {
  if (status === 'friend') return 'удалить';
  if (status === 'none') return 'добавить';
  if (status === 'sent') return 'отправлено';
  if (status === 'received') return 'входящая заявка';
  if (status === 'rejected') return 'отклонено';
  return '';
};

export const getFriendButtonClassByStatus = (status: FriendStatus, classes: Record<string, string>) => {
  if (status === 'friend') return classes.friend_btn_remove;
  if (status === 'none') return classes.friend_btn_add;
  if (status === 'sent') return classes.friend_btn_sent;
  if (status === 'rejected') return classes.friend_btn_disabled;
  if (status === 'received') return classes.friend_btn_received;
  return '';
};
