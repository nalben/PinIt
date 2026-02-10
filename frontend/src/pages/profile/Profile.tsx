import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import classes from "./Profile.module.scss";
import axiosInstance, { API_URL } from "@/api/axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Logo from '@/assets/icons/colored/Logo.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import AuthModal from "@/components/auth/authmodal/AuthModal";
import GuestOnly from "@/components/__general/guestonly/Guestonly";
import AuthTrigger from "@/components/auth/AuthTrigger";
import ResetPasswordForm from "@/components/auth/reset/ResetPasswordForm";
import AuthOnly from "@/components/__general/authonly/Authonly";
import Edit from '@/assets/icons/monochrome/edit.svg'
import { useAuthStore } from "@/store/authStore";
import { connectSocket } from "@/services/socketManager";
import { useUIStore } from "@/store/uiStore";
import { useNotificationsStore } from "@/store/notificationsStore";
import ProfileSkeleton from "./ProfileSkeleton";
// РРЅС‚РµСЂС„РµР№СЃС‹
interface ProfileData {
  id: number;
  avatar?: string | null;
  role: string;
  isOwner: boolean;
  username: string;
  created_at: string;
  nickname?: string | null;
  status?: string | null;
}
interface UpdateProfileResponse {
  message: string;
  user: ProfileData;
}
type FriendStatus = 'friend' | 'none' | 'sent' | 'rejected' | 'received';

interface FriendItem extends ProfileData {
  friendStatus: FriendStatus;
  requestId?: number;
}

type ProfileError = "NOT_FOUND" | "UNKNOWN";

// РўРёРї СЃРѕСЃС‚РѕСЏРЅРёСЏ РјРѕРґР°Р»РєРё
type OpenModal = "edit" | "reset" | null;

const Profile = () => {
  const MAX_AVATAR_SIZE_MB = 5;
  const MAX_AVATAR_SIZE_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;

  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendStatusById, setFriendStatusById] = useState<Record<number, { status: FriendStatus; requestId?: number }>>({});
  const [shareTextById, setShareTextById] = useState<Record<number, string>>({});
  const [nicknameInput, setNicknameInput] = useState<string>('');
  const [statusInput, setStatusInput] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const { user, isAuth, isInitialized } = useAuthStore();
  const { openHeaderDropdown } = useUIStore();
  const { setHighlightRequestId } = useNotificationsStore();

  // РЎРєР»РѕРЅРµРЅРёРµ
  const declension = (number: number, titles: [string, string, string]) => {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return titles[2];
    if (n1 > 1 && n1 < 5) return titles[1];
    if (n1 === 1) return titles[0];
    return titles[2];
  };

  const safeCopyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      // СЃС‚Р°РЅРґР°СЂС‚РЅС‹Р№ СЃРїРѕСЃРѕР± РЅР° HTTPS РёР»Рё localhost
      return navigator.clipboard.writeText(text);
    } else {
      // fallback РґР»СЏ HTTP РёР»Рё СЃС‚Р°СЂС‹С… Р±СЂР°СѓР·РµСЂРѕРІ
      return new Promise<void>((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed'; // С‡С‚РѕР±С‹ РЅРµ СЃРєСЂРѕР»Р»РёР»Рѕ СЃС‚СЂР°РЅРёС†Сѓ
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) resolve();
          else reject(new Error('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ'));
        } catch (err) {
          document.body.removeChild(textarea);
          reject(err);
        }
      });
    }
  };

  const handleShare = (userId: number, username: string) => {
    // СЃРѕР±РёСЂР°РµРј СЃСЃС‹Р»РєСѓ РЅР° С‚РµРєСѓС‰РёР№ СЃР°Р№С‚
    const profileUrl = `${window.location.origin}/user/${username}`;
    safeCopyToClipboard(profileUrl)
      .then(() => {
        setShareTextById(prev => ({ ...prev, [userId]: 'Скопировано' }));
        setTimeout(() => {
          setShareTextById(prev => ({ ...prev, [userId]: 'Поделиться' }));
        }, 2000);
      })
      .catch(err => console.error('РћС€РёР±РєР° РєРѕРїРёСЂРѕРІР°РЅРёСЏ РІ Р±СѓС„РµСЂ:', err));
  };


  const timeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    if (diffYears > 0) return `${diffYears} ${declension(diffYears, ['год', 'года', 'лет'])}`;
    if (diffMonths > 0) return `${diffMonths} ${declension(diffMonths, ['месяц', 'месяца', 'месяцев'])}`;
    if (diffDays > 0) return `${diffDays} ${declension(diffDays, ['день', 'дня', 'дней'])}`;
    if (diffHours > 0) return `${diffHours} ${declension(diffHours, ['час', 'часа', 'часов'])}`;
    if (diffMinutes > 0) return `${diffMinutes} ${declension(diffMinutes, ['минуту', 'минуты', 'минут'])}`;
    return 'только что';
  };
  useEffect(() => {
    if (openModal !== 'edit') {
      setAvatarPreview(null);
      setAvatarFile(null);
    }
  }, [openModal]);
  useEffect(() => {
    if (profile) {
      setNicknameInput(profile.nickname || '');
      setStatusInput(profile.status || '');
    }
  }, [profile]);

  const refreshFriendCount = async () => {
    if (!username) return;
    try {
      const { data } =
        await axiosInstance.get<{ friend_count: number }>(`/api/profile/${username}/friends-count`);
      setFriendCount(data.friend_count);
    } catch (err) {
      console.error('Ошибка при обновлении количества друзей', err);
    }
  };

  const refreshFriendsList = async () => {
    if (!profile?.isOwner) return;
    try {
      const { data } =
        await axiosInstance.get<FriendItem[]>(`/api/profile/${profile.username}/friends`);
      setFriends(data);
      // заполняем статусы друзей
      const statuses: Record<number, { status: FriendStatus }> = {};
      data.forEach(f => {
        statuses[f.id] = { status: 'friend' };
      });
      setFriendStatusById(prev => ({ ...prev, ...statuses }));
    } catch (err) {
      console.error('Ошибка при обновлении списка друзей', err);
    }
  };

  // Р—Р°РіСЂСѓР·РєР° РїСЂРѕС„РёР»СЏ
  useEffect(() => {
  if (!isInitialized) return;

  const fetchProfileData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setProfile(null);
      setFriendCount(null);
      setFriends([]);
      setFriendStatusById({});
      setShareTextById({});

      const { data } =
        await axiosInstance.get<ProfileData>(`/api/profile/${username}`);
      setProfile(data);

      await refreshFriendCount();

      if (!data.isOwner && isAuth) {
        const { data: statusData } =
          await axiosInstance.get<{ status: FriendStatus; requestId?: number }>(
            `/api/friends/status/${data.id}`
          );

        setFriendStatusById(prev => ({
          ...prev,
          [data.id]: {
            status: statusData.status,
            requestId: statusData.requestId
          }
        }));
      }

    } catch (err: any) {
      if (err.response?.status === 404) {
        setError("NOT_FOUND");
      } else {
        console.error(err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (username) fetchProfileData();
}, [username, isAuth, isInitialized]);
useEffect(() => {
  if (!profile?.id || !profile.isOwner) return;

  refreshFriendsList();
}, [profile?.id, profile?.isOwner]);

useEffect(() => {
  if (!profile?.id) return;
  const handleFriendStatusChange = (data: { userId: number; status: FriendStatus; requestId?: number }) => {
    // обновляем статус текущего профиля и друзей
    setFriendStatusById(prev => ({
      ...prev,
      [data.userId]: {
        status: data.status,
        requestId: data.requestId ?? prev[data.userId]?.requestId
      }
    }));
    setFriends(prev =>
      prev.map(f =>
        f.id === data.userId
          ? {
              ...f,
              friendStatus: data.status,
              requestId: data.requestId ?? f.requestId
            }
          : f
      )
    );

    const shouldUpdateCounts = profile?.isOwner || profile?.id === data.userId;
    if (shouldUpdateCounts) {
      refreshFriendCount();
      if (profile?.isOwner && data.status === 'friend') {
        // только при подтверждении дружбы подтягиваем новый список,
        // чтобы при удалении друг оставался в списке с кнопкой "добавить"
        refreshFriendsList();
      }
    }
  };
  const handleNewRequest = (data: any) => {
    setFriendStatusById(prev => ({
      ...prev,
      [data.user_id]: { status: 'received', requestId: data.id }
    }));
  };
  const handleRemoveRequest = (data: { id: number }) => {
    setFriendStatusById(prev => {
      const updated = { ...prev };
      for (const key in updated) {
        if (updated[key].requestId === data.id) {
          updated[key] = {
            status: updated[key].status === 'friend' ? 'friend' : 'none'
          };
        }
      }
      return updated;
    });
    setFriends(prev => prev.map(f =>
      f.requestId === data.id ? { ...f, friendStatus: 'none', requestId: undefined } : f
    ));
  };

  const unsubscribe = connectSocket({
    onFriendStatusChange: handleFriendStatusChange,
    onNewRequest: handleNewRequest,
    onRemoveRequest: handleRemoveRequest
  });
  return () => {
    unsubscribe?.();
  };
}, [profile?.id]);



  const profileFriendStatus = profile ? friendStatusById[profile.id]?.status ?? 'none' : 'none';
  const profileFriendRequestId = profile ? friendStatusById[profile.id]?.requestId : undefined;

const handleFriendAction = async (userId: number) => {
  const current = friendStatusById[userId]?.status ?? 'none';
  const requestId = friendStatusById[userId]?.requestId;

  try {
    if (current === 'friend') {
      await axiosInstance.delete(`/api/friends/${userId}`);
      setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'none' } }));
    } else if (current === 'none') {
      if (friendStatusById[userId]?.status === 'sent' || friendStatusById[userId]?.status === 'rejected') return;
      const { data } = await axiosInstance.post<{ id: number }>(`/api/friends/send`, { friend_id: userId });
      setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'sent', requestId: data.id } }));
    } else if (current === 'sent' && requestId) {
      await axiosInstance.delete(`/api/friends/remove-request/${requestId}`);
      setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'none' } }));
    }else if (current === 'received' && requestId) {
  await axiosInstance.put(`/api/friends/accept/${requestId}`);
  setFriendStatusById(prev => ({
    ...prev,
    [userId]: { status: 'friend' }
  }));
}

  } catch (e) {
    console.error(e);
  }
};



  const getButtonText = (status: FriendStatus) => {
    if (status === 'friend') return 'удалить';
    if (status === 'none') return 'добавить';
    if (status === 'sent') return 'отправлено';
    if (status === 'received') return 'входящая заявка';
    if (status === 'rejected') return 'отклонено';
    return '';
  };

  const getButtonClass = (status: FriendStatus) => {
    if (status === 'friend') return classes.friend_btn_remove;
    if (status === 'none') return classes.friend_btn_add;
    if (status === 'sent') return classes.friend_btn_sent;
    if (status === 'rejected') return classes.friend_btn_disabled;
    if (status === 'received') return classes.friend_btn_received;
    return '';
  };

  const storedUsername = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
  const isOwnerSkeleton = Boolean(username && (user?.username ?? storedUsername) === username);
  const isHeartUser = username === 'phenomenon';
  if (isLoading) return <ProfileSkeleton isOwner={isOwnerSkeleton} isHeart={isHeartUser} />;
  if (error === "NOT_FOUND") return (
    <div className={classes.profile_not_found}>
      <h1>Пользователь <span>{username}</span> не найден</h1>
      <p>Возможно, он был удален или вы ошиблись в имени.</p>
      <Mainbtn kind="navlink" href="/home" text="На главную страницу" />
    </div>
  );
  if (!profile) return null;

  const UserNickname = profile.nickname || profile.username;
  const avatarSrc = profile.isOwner && user?.avatar
    ? (user.avatar.startsWith('/uploads/') ? `${API_URL}${user.avatar}` : `${API_URL}/uploads/${user.avatar}`)
    : profile.avatar
      ? (profile.avatar.startsWith('/uploads/') ? `${API_URL}${profile.avatar}` : `${API_URL}/uploads/${profile.avatar}`)
      : null;
      
  return (
    <div className={classes.profile}>
      <div 
        className={`${classes.avatar_con} ${profile.username === 'phenomenon' ? classes.heart : ''}`}
      >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt="avatar"
          width={200}
          height={200}
        />
      ) : (
        <Default />
      )}
      </div>
      <div className={classes.profile_username}>
        <span>{UserNickname}</span>
        {profile.status && <div className={classes.profile_status}>{profile.status}</div>}
        <div><Logo /><h1>{profile.username}</h1></div>
      </div>
      <div className={classes.friends}>
        {profile.isOwner ? (
          <div className={classes.profile_interact_con}>
            <button
              type="button"
              className={classes.friends_btn}
              onClick={() => friendCount && friendCount > 0 && setIsFriendsOpen(true)}
              disabled={!friendCount || friendCount === 0}
            >
              Друзей: {friendCount ?? 'нет'}
            </button>
            <AuthModal isOpen={isFriendsOpen} onClose={() => setIsFriendsOpen(false)}>
              <div className={classes.friends_modal}>
                <strong>Друзья</strong>
                <div className={classes.friends_item_con}>
                    {friends.map(friend => {
                      const status = friendStatusById[friend.id]?.status ?? 'friend';
                      const avatarSrc = friend.avatar
                        ? friend.avatar.startsWith('/uploads/')
                          ? `${API_URL}${friend.avatar}`
                          : `${API_URL}/uploads/${friend.avatar}`
                        : null;

                      return (
                        <div key={friend.id} className={classes.friend_item}>
                          <Link to={`/user/${friend.username}`} className={classes.friend_info}>
                            <div className={classes.friend_info_wrap}>
                              {avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <Default />}
                              <div className={classes.friend_info_text}>
                                <span>{friend.nickname || friend.username}</span>
                                <p>в друзьях: {timeAgo(friend.created_at)}</p>
                              </div>
                            </div>
                          </Link>
                        <div className={getButtonClass(status)}>
                          <Mainbtn
                            text={getButtonText(status)}
                            variant="auth"
                            kind="button"
                            onClick={() => {
                              if (status === 'received') {
                                setIsFriendsOpen(false);
                                openHeaderDropdown('notifications');
                                if (friend.requestId) setHighlightRequestId(friend.requestId);
                                return;
                              }
                              handleFriendAction(friend.id);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AuthModal>

            <div className={classes.interact_btns}>
              <Mainbtn
                text={shareTextById[profile.id] || 'Поделиться'}
                variant="auth"
                kind="button"
                onClick={() => handleShare(profile.id, profile.username)}
              />
              <Mainbtn
                text="Редактировать"
                variant="auth"
                kind="button"
                onClick={() => setOpenModal("edit")}
              />

              <AuthModal
                isOpen={openModal === "edit"}
                onClose={() => setOpenModal(null)}
                closeOnOverlayClick={false}
              >
                <div>
                  <form
                    className={classes.edit_modal}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const formData = new FormData();
                        formData.append('nickname', (e.currentTarget.nickname as HTMLInputElement).value);
                        formData.append('status', (e.currentTarget.status as HTMLInputElement).value);
                        const avatarFile = (e.currentTarget.avatar as HTMLInputElement).files?.[0];
                        if (avatarFile) formData.append('avatar', avatarFile);

                        const { data } = await axiosInstance.put<UpdateProfileResponse>(
                          '/api/profile/me',
                          formData,
                          { headers: { 'Content-Type': 'multipart/form-data' } }
                        );

                        setProfile(prev => prev ? { ...prev, ...data.user } : data.user);
                        window.dispatchEvent(new Event('profile-updated'));
                        setOpenModal(null);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  >
                    <div className={classes.avatar_upload}>
                      <label htmlFor="avatar" className={classes.upload_label}>
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="avatar preview" />
                        ) : profile.avatar ? (
                          <img
                            src={
                              profile.avatar.startsWith('/uploads/')
                                ? `${API_URL}${profile.avatar}`
                                : `${API_URL}/uploads/${profile.avatar}`
                            }
                            alt="avatar"
                          />
                        ) : (
                          <Default />
                        )}
                        <Edit />
                      </label>
                      <label htmlFor="avatar" className={classes.upload_label}>
                        <span>изменить</span>
                      </label>
                      <input
                        type="file"
                        id="avatar"
                        name="avatar"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          if (!file.type.startsWith('image/')) {
                            alert('РњРѕР¶РЅРѕ Р·Р°РіСЂСѓР¶Р°С‚СЊ С‚РѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ');
                            e.target.value = '';
                            return;
                          }

                          if (file.size > MAX_AVATAR_SIZE_BYTES) {
                            alert(`Максимальный размер аватара: ${MAX_AVATAR_SIZE_MB}MB`);
                            e.target.value = '';
                            setAvatarFile(null);
                            setAvatarPreview(null);
                            return;
                          }

                          setAvatarFile(file);
                          setAvatarPreview(URL.createObjectURL(file));
                        }}
                      />
                    </div>
                    <label className={classes.itput_text_label}>
                    <span className={classes.itput_text_label_item}>Никнейм</span>
                    <input
                      type="text"
                      name="nickname"
                      maxLength={50}
                      value={nicknameInput}
                      onChange={e => setNicknameInput(e.target.value)}
                      placeholder="Введите никнейм"
                    />
                  </label>

                  <label className={classes.itput_text_label}>
                    <span className={classes.itput_text_label_item}>Статус</span>
                    <input
                      type="text"
                      name="status"
                      maxLength={100}
                      value={statusInput}
                      onChange={e => setStatusInput(e.target.value)}
                      placeholder="Введите статус"
                    />
                  </label>
                  <div className={classes.edit_menu_int}>
                    <Mainbtn type="button" text="Изменить пароль" onClick={() => setOpenModal("reset")} />
                    <Mainbtn text="Сохранить" type="submit" />
                  </div>
                  </form>

                </div>
              </AuthModal>
              <AuthModal
                isOpen={openModal === "reset"}
                onClose={() => setOpenModal(null)}
                closeOnOverlayClick={false}
              >
                <ResetPasswordForm
                  onClose={() => setOpenModal(null)}
                  initialStep={2}
                  initialUsername={profile.username}
                />
              </AuthModal>

            </div>
          </div>
        ) : (
          <div className={classes.interact_btns}>
            <Mainbtn text={shareTextById[profile.id] || 'Поделиться'} variant="mini" kind="button" onClick={() => handleShare(profile.id, profile.username)} />
            <GuestOnly>
              <AuthTrigger type='login'>
                <div className={getButtonClass(profileFriendStatus)}>
                  <Mainbtn text="добавить" />
                </div>
              </AuthTrigger>
            </GuestOnly>
            <AuthOnly>
              <div className={getButtonClass(profileFriendStatus)}>
                <Mainbtn
                  text={getButtonText(profileFriendStatus)}
                  variant="auth"
                  kind="button"
                  disabled={profileFriendStatus === 'rejected'}
                  onClick={() => {
                    if (profileFriendStatus === 'received') {
                      openHeaderDropdown('notifications');
                      if (profileFriendRequestId) setHighlightRequestId(profileFriendRequestId);
                      return;
                    }
                    handleFriendAction(profile.id);
                  }}
                />
              </div>
            </AuthOnly>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;





