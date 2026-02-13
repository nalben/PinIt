import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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


interface ProfileData {
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
interface UpdateProfileResponse {
  message: string;
  user: ProfileData;
}
type FriendStatus = 'friend' | 'none' | 'sent' | 'rejected' | 'received';

type ProfileError = "NOT_FOUND" | "UNKNOWN";

type OpenModal = "edit" | "reset" | null;

const Profile = () => {
  const MAX_AVATAR_SIZE_MB = 5;
  const MAX_AVATAR_SIZE_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;

  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [friendStatusById, setFriendStatusById] = useState<Record<number, { status: FriendStatus; requestId?: number }>>({});
  const [shareTextById, setShareTextById] = useState<Record<number, string>>({});
  const [nicknameInput, setNicknameInput] = useState<string>('');
  const [statusInput, setStatusInput] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const { user, isAuth, isInitialized } = useAuthStore();
  const { openHeaderDropdown, openFriendsModal } = useUIStore();
  const { setHighlightRequestId } = useNotificationsStore();

  const safeCopyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    } else {
      return new Promise<void>((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
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

  useEffect(() => {
  if (!isInitialized) return;

  const fetchProfileData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setProfile(null);
      setFriendCount(null);
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
  if (!profile?.id) return;
  const handleFriendStatusChange = (data: { userId: number; status: FriendStatus; requestId?: number }) => {
    setFriendStatusById(prev => ({
      ...prev,
      [data.userId]: {
        status: data.status,
        requestId: data.requestId ?? prev[data.userId]?.requestId
      }
    }));

    const shouldUpdateCounts = profile?.isOwner || profile?.id === data.userId;
    if (shouldUpdateCounts) {
      refreshFriendCount();
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

const handleFriendAction = async (userId: number) => {
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
      setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'none' } }));
    } else if (current === 'none') {
      if (friendStatusById[userId]?.status === 'sent' || friendStatusById[userId]?.status === 'rejected') return;
      const { data } = await axiosInstance.post<{ id: number }>(`/api/friends/send`, { friend_id: userId });
      setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'sent', requestId: data.id } }));
    } else if (current === 'sent' && requestId) {
      await axiosInstance.delete(`/api/friends/remove-request/${requestId}`);
      setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'none' } }));
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
              onClick={() => openFriendsModal("list")}
            >
              Друзей: {friendCount ?? 'нет'}
            </button>

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
                  onClick={() => handleFriendAction(profile.id)}
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





