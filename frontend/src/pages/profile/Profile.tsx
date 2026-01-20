import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import classes from "./Profile.module.scss";
import axiosInstance from "../../../axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Logo from '@/assets/icons/colored/Logo.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import AuthModal from "@/components/auth/authmodal/AuthModal";

interface ProfileData {
  id: number;
  avatar?: string | null;
  role: string;
  isOwner: boolean;
  username: string;
  created_at: string;
  nickname?: string | null;
}

type FriendStatus = 'friend' | 'none' | 'sent';

interface FriendItem extends ProfileData {
  friendStatus: FriendStatus;
  requestId?: number;
}

type ProfileError = "NOT_FOUND" | "UNKNOWN";

const Profile = () => {
  const { username } = useParams<{ username: string }>();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);

  // Состояние для статусов друзей
  const [friendStatusById, setFriendStatusById] = useState<Record<number, { status: FriendStatus; requestId?: number }>>({});

  // Функция склонения
  const declension = (number: number, titles: [string, string, string]) => {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return titles[2];
    if (n1 > 1 && n1 < 5) return titles[1];
    if (n1 === 1) return titles[0];
    return titles[2];
  };

  // Функция "n времени назад"
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

  // Загрузка профиля и количества друзей
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const url = `/api/profile/${username}`;
        const { data } = await axiosInstance.get<ProfileData>(url);
        setProfile(data);

        const countUrl = `/api/profile/${username}/friends-count`;
        const { data: countData } = await axiosInstance.get<{ friend_count: number }>(countUrl);
        setFriendCount(countData.friend_count);

        // Если это не владелец, подгружаем статус дружбы
        if (!data.isOwner) {
          const { data: statusData } = await axiosInstance.get<{ status: FriendStatus; requestId?: number }>(
            `/api/friends/status/${data.id}`
          );
          setFriendStatusById(prev => ({
            ...prev,
            [data.id]: { status: statusData.status, requestId: statusData.requestId }
          }));
        }

      } catch (err: any) {
        if (err.response?.status === 404) setError("NOT_FOUND");
        else setError("UNKNOWN");
      } finally {
        setIsLoading(false);
      }
    };

    if (username) fetchProfileData();
  }, [username]);

  // Загрузка друзей владельца
  useEffect(() => {
    if (!profile || !profile.isOwner) return;

    const fetchFriends = async () => {
      try {
        const { data } = await axiosInstance.get<ProfileData[]>(`/api/friends/${profile.id}`);
        const mapped: FriendItem[] = data.map(f => ({ ...f, friendStatus: 'friend' }));
        setFriends(mapped);

        const statusMap: Record<number, { status: FriendStatus }> = {};
        data.forEach(f => (statusMap[f.id] = { status: 'friend' }));
        setFriendStatusById(prev => ({ ...prev, ...statusMap }));
      } catch (err) {
        console.error(err);
      }
    };

    fetchFriends();
  }, [profile]);

  // Статус профиля для гостя
  const profileFriendStatus = profile ? friendStatusById[profile.id]?.status ?? 'none' : 'none';

  // Действие с другом
  const handleFriendAction = async (userId: number) => {
    const current = friendStatusById[userId]?.status ?? 'none';
    const requestId = friendStatusById[userId]?.requestId;

    try {
      if (current === 'friend') {
        await axiosInstance.delete(`/api/friends/${userId}`);
        setFriendStatusById(prev => ({ ...prev, [userId]: { status: 'none' } }));
      } else if (current === 'none') {
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

  // Классы и тексты кнопок
  const getButtonText = (status: FriendStatus) => {
    if (status === 'friend') return 'удалить';
    if (status === 'none') return 'добавить';
    return 'отправлено';
  };

  const getButtonClass = (status: FriendStatus) => {
    if (status === 'friend') return classes.friend_btn_remove;
    if (status === 'none') return classes.friend_btn_add;
    return classes.friend_btn_sent;
  };

  if (isLoading) return <div className={classes.profile_loading}><p>Загрузка...</p></div>;
  if (error === "NOT_FOUND") return (
    <div className={classes.profile_not_found}>
      <h1>Пользователь <span>{username}</span> не найден</h1>
      <p>Возможно, он был удален или вы ошиблись в имени.</p>
      <Mainbtn kind="navlink" href="/home" text="На главную страницу" />
    </div>
  );
  if (!profile) return null;

  const UserNickname = profile.nickname || profile.username;

  return (
    <div className={classes.profile}>
      <div className={classes.avatar_con}>
        {profile.avatar ? <img src={profile.avatar} alt="avatar" /> : <Default />}
      </div>

      <div className={classes.profile_username}>
        <span>{UserNickname}</span>
        <p><Logo/><h1>{profile.username}</h1></p>
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
                    return (
                      <div key={friend.id} className={classes.friend_item}>
                        <Link to={`/user/${friend.username}`} className={classes.friend_info}>
                          <div className={classes.friend_info_wrap}>
                            {friend.avatar ? <img src={friend.avatar} alt="avatar" /> : <Default />}
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
                            onClick={() => handleFriendAction(friend.id)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AuthModal>

            <div className={classes.interact_btns}>
              <Mainbtn text="Поделиться" />
              <Mainbtn text="Редактировать" />
            </div>
          </div>
        ) : (
          <div className={classes.interact_btns}>
            <Mainbtn text="Поделиться" />
            <div className={getButtonClass(profileFriendStatus)}>
              <Mainbtn
                text={getButtonText(profileFriendStatus)}
                variant="auth"
                kind="button"
                onClick={() => handleFriendAction(profile.id)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
