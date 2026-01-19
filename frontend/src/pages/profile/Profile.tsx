import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import classes from "./Profile.module.scss";
import axiosInstance from "../../../axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Logo from '@/assets/icons/colored/Logo.svg'
import Default from '@/assets/icons/monochrome/default-user.svg'
import AuthModal from "@/components/auth/authmodal/AuthModal";
import DropdownWrapper from "@/components/_UI/dropdownwrapper/DropdownWrapper";

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
  
// Функция для выбора правильного склонения
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
    const diffMs = now.getTime() - past.getTime(); // разница в миллисекундах

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears} ${declension(diffYears, ['год', 'года', 'лет'])} `;
    if (diffMonths > 0) return `${diffMonths} ${declension(diffMonths, ['месяц', 'месяца', 'месяцев'])} `;
    if (diffDays > 0) return `${diffDays} ${declension(diffDays, ['день', 'дня', 'дней'])} `;
    if (diffHours > 0) return `${diffHours} ${declension(diffHours, ['час', 'часа', 'часов'])} `;
    if (diffMinutes > 0) return `${diffMinutes} ${declension(diffMinutes, ['минуту', 'минуты', 'минут'])} `;
    return 'только что';
  };

useEffect(() => {
  if (!profile) return;

  const fetchFriends = async () => {
    try {
      const { data } = await axiosInstance.get<ProfileData[]>(
        `/api/friends/${profile.id}`
      );

      const mapped: FriendItem[] = data.map((f) => ({
        ...f,
        friendStatus: 'friend',
      }));

      setFriends(mapped); // ← ТОЛЬКО ТАК
    } catch (err) {
      console.error('Ошибка при получении друзей', err);
    }
  };

  fetchFriends();
}, [profile]);


const handleFriendAction = async (friend: FriendItem) => {
  try {
    // 1. Удаление из друзей
    if (friend.friendStatus === 'friend') {
      await axiosInstance.delete(`/api/friends/${friend.id}`);
      setFriends(prev =>
        prev.map(f =>
          f.id === friend.id
            ? { ...f, friendStatus: 'none' }
            : f
        )
      );
    }

    // 2. Отправка заявки
    if (friend.friendStatus === 'none') {
      const { data } = await axiosInstance.post<{ id: number }>(
        `/api/friends/send`,
        { friend_id: friend.id }
      );

      setFriends(prev =>
        prev.map(f =>
          f.id === friend.id
            ? { ...f, friendStatus: 'sent', requestId: data.id }
            : f
        )
      );
    }

    // 3. Отмена заявки
    if (friend.friendStatus === 'sent' && friend.requestId) {
      await axiosInstance.delete(
        `/api/friends/remove-request/${friend.requestId}`
      );

      setFriends(prev =>
        prev.map(f =>
          f.id === friend.id
            ? { ...f, friendStatus: 'none', requestId: undefined }
            : f
        )
      );
    }
  } catch (e) {
    console.error(e);
  }
};


const getButtonText = (status: FriendStatus) => {
  if (status === 'friend') return 'удалить';
  if (status === 'none') return 'добавить';
  return 'отправлено';
};

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const url = `/api/profile/${username}`;
        const { data } = await axiosInstance.get<ProfileData>(url);
        setProfile(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError("NOT_FOUND");
        } else {
          setError("UNKNOWN");
        }
      } finally {
        setIsLoading(false);
      }
    };



    const fetchFriendCount = async () => {
      try {
        const url = `/api/profile/${username}/friends-count`;
        const { data } = await axiosInstance.get<{ friend_count: number }>(url);
        setFriendCount(data.friend_count);
      } catch (err: any) {
        console.error("Error fetching friend count:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (username) {
      fetchProfile();
      fetchFriendCount();
    }
  }, [username]);

  useEffect(() => {
    if (!profile) return;

    const titleName = profile.nickname || profile.username;
    document.title = `${titleName} | PinIt`;
  }, [profile]);

  if (isLoading) {
    return (
      <div className={classes.profile_loading}>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (error === "NOT_FOUND") {
    return (
      <div className={classes.profile_not_found}>
        <h1>Пользователь <span>{username}</span> не найден</h1>
        <p>Возможно, он был удален или вы ошиблись в имени.</p>
        <Mainbtn
          kind="navlink"
          href="/home"
          text="На главную страницу"
        />
      </div>
    );
  }

  if (!profile) return null;

  const UserNickname = profile.nickname ? profile.nickname : profile.username;


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
                onClick={() => setIsFriendsOpen(true)}
              >
                Друзей: {friendCount ?? 'нет'}
              </button>
              <AuthModal isOpen={isFriendsOpen} onClose={() => setIsFriendsOpen(false)}>
                <div className={classes.friends_modal}>
                  <strong>Друзья</strong>
                  <div className={classes.friends_item_con}>
                    {friends.map(friend => (
                      <div key={friend.id} className={classes.friend_item}>
                        <Link to={`/user/${friend.username}`} className={classes.friend_info}>
                          <div className={classes.friend_info_wrap}>
                            {friend.avatar ? (
                              <img src={friend.avatar} alt="avatar" />
                            ) : (
                              <Default />
                            )}

                            <div className={classes.friend_info_text}>
                              <span>{friend.nickname || friend.username}</span>
                              <p>в друзьях: {timeAgo(friend.created_at)}</p>
                            </div>
                          </div>
                        </Link>

                        <Mainbtn
                          text={getButtonText(friend.friendStatus)}
                          variant="auth"
                          kind="button"
                          onClick={() => handleFriendAction(friend)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </AuthModal>


            <div className={classes.owner_btns}>
              <Mainbtn 
              text="share"
              />
              <Mainbtn 
              text="edit"
              />
            </div>
          </div>
        ) : (
          <div className={classes.guest_btns}>
            share add
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;