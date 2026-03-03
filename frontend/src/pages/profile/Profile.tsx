import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import classes from './Profile.module.scss';
import axiosInstance from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import Logo from '@/assets/icons/colored/Logo.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import GuestOnly from '@/components/__general/guestonly/Guestonly';
import AuthTrigger from '@/components/auth/AuthTrigger';
import ResetPasswordForm from '@/components/auth/reset/ResetPasswordForm';
import AuthOnly from '@/components/__general/authonly/Authonly';
import Edit from '@/assets/icons/monochrome/edit.svg';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import ProfileSkeleton from './ProfileSkeleton';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';
import type { OpenModal, UpdateProfileResponse } from '@/components/profilepage/model';
import { useProfilePageData } from '@/components/profilepage/hooks/useProfilePageData';
import { getFriendButtonClassByStatus, getFriendButtonText } from '@/components/profilepage/utils/friendUi';
import { resolveProfileAvatarPath, resolveProfileAvatarSrc } from '@/components/profilepage/utils/avatar';

const MAX_AVATAR_SIZE_MB = 5;
const MAX_AVATAR_SIZE_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;

const Profile = () => {
  const { username } = useParams<{ username: string }>();
  const [nicknameInput, setNicknameInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const { user, isInitialized, hasToken } = useAuthStore();
  const { openHeaderDropdown, openFriendsModal, showTopAlarm } = useUIStore();
  const { setHighlightRequestId } = useNotificationsStore();

  const {
    profile,
    setProfile,
    error,
    friendCount,
    isLoading,
    profileFriendStatus,
    shareTextById,
    handleShare,
    handleFriendAction,
  } = useProfilePageData({
    username,
    isInitialized,
    hasToken,
    openHeaderDropdown,
    setHighlightRequestId,
  });

  useEscapeHandler({
    id: 'profile:edit-modal',
    priority: 600,
    isOpen: openModal !== null,
    onEscape: () => setOpenModal(null),
  });

  useEffect(() => {
    if (openModal !== 'edit') {
      setAvatarPreview(null);
      setAvatarFile(null);
    }
  }, [openModal]);

  useEffect(() => {
    if (!profile) return;
    setNicknameInput(profile.nickname || '');
    setStatusInput(profile.status || '');
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const displayName = (profile.nickname ?? '').trim() || profile.username;
    document.title = `${displayName} | PinIt`;
  }, [profile]);

  const handleProfileSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('nickname', nicknameInput);
      formData.append('status', statusInput);
      if (avatarFile) formData.append('avatar', avatarFile);

      const { data } = await axiosInstance.put<UpdateProfileResponse>('/api/profile/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setProfile((prev) => (prev ? { ...prev, ...data.user } : data.user));
      window.dispatchEvent(new Event('profile-updated'));
      setOpenModal(null);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showTopAlarm('Можно загружать только изображения');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      showTopAlarm(`Вес слишком большой — выберите изображение весом до ${MAX_AVATAR_SIZE_MB} МБ.`);
      e.target.value = '';
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const isOwnerSkeleton = Boolean(username && hasToken && user?.username === username);
  const isHeartUser = username === 'phenomenon';

  if (isLoading) return <ProfileSkeleton isOwner={isOwnerSkeleton} isHeart={isHeartUser} />;

  if (error === 'NOT_FOUND') {
    return (
      <div className={classes.profile_not_found}>
        <h1>
          Пользователь <span>{username}</span> не найден
        </h1>
        <p>Возможно, он был удален или вы ошиблись в имени.</p>
        <Mainbtn kind="navlink" href="/home" text="На главную страницу" />
      </div>
    );
  }

  if (!profile) return null;

  const displayName = (profile.nickname ?? '').trim() || profile.username;
  const avatarSrc = resolveProfileAvatarSrc({ profile, authAvatar: user?.avatar ?? null });

  return (
    <div className={classes.profile}>
      <div className={`${classes.avatar_con} ${profile.username === 'phenomenon' ? classes.heart : ''}`}>
        {avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <Default />}
      </div>

      <div className={classes.profile_username}>
        <span>{displayName}</span>
        {profile.status ? <div className={classes.profile_status}>{profile.status}</div> : null}
        <div>
          <Logo />
          <h1>{profile.username}</h1>
        </div>
      </div>

      <div className={classes.friends}>
        {profile.isOwner ? (
          <div className={classes.profile_interact_con}>
            <button type="button" className={classes.friends_btn} onClick={() => openFriendsModal('list')}>
              Друзей: {friendCount ?? 'нет'}
            </button>

            <div className={classes.interact_btns}>
              <Mainbtn
                text={shareTextById[profile.id] || 'Поделиться'}
                variant="auth"
                kind="button"
                onClick={() => handleShare(profile.id, profile.username)}
              />
              <Mainbtn text="Редактировать" variant="auth" kind="button" onClick={() => setOpenModal('edit')} />

              <AuthModal isOpen={openModal === 'edit'} onClose={() => setOpenModal(null)} closeOnOverlayClick={false}>
                <form className={classes.edit_modal} onSubmit={handleProfileSave}>
                  <div className={classes.avatar_upload}>
                    <label htmlFor="avatar" className={classes.upload_label}>
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="avatar preview" />
                      ) : profile.avatar ? (
                        <img src={resolveProfileAvatarPath(profile.avatar) ?? ''} alt="avatar" />
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
                      onChange={handleAvatarChange}
                    />
                  </div>

                  <label className={classes.itput_text_label}>
                    <span className={classes.itput_text_label_item}>Никнейм</span>
                    <input
                      type="text"
                      name="nickname"
                      maxLength={50}
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
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
                      onChange={(e) => setStatusInput(e.target.value)}
                      placeholder="Введите статус"
                    />
                  </label>

                  <div className={classes.edit_menu_int}>
                    <Mainbtn type="button" text="Изменить пароль" onClick={() => setOpenModal('reset')} />
                    <Mainbtn text="Сохранить" type="submit" />
                  </div>
                </form>
              </AuthModal>

              <AuthModal isOpen={openModal === 'reset'} onClose={() => setOpenModal(null)} closeOnOverlayClick={false}>
                <ResetPasswordForm onClose={() => setOpenModal(null)} initialStep={2} initialUsername={profile.username} />
              </AuthModal>
            </div>
          </div>
        ) : (
          <div className={classes.interact_btns}>
            <Mainbtn
              text={shareTextById[profile.id] || 'Поделиться'}
              variant="mini"
              kind="button"
              onClick={() => handleShare(profile.id, profile.username)}
            />

            <GuestOnly>
              <AuthTrigger type="login">
                <div className={getFriendButtonClassByStatus(profileFriendStatus, classes)}>
                  <Mainbtn text="добавить" />
                </div>
              </AuthTrigger>
            </GuestOnly>

            <AuthOnly>
              <div className={getFriendButtonClassByStatus(profileFriendStatus, classes)}>
                <Mainbtn
                  text={getFriendButtonText(profileFriendStatus)}
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
