import React, { useEffect, useRef, useState } from "react";
import axiosInstance, { API_URL } from "../../../axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Default from '@/assets/icons/monochrome/default-user.svg';
import classes from './Friendlist.module.scss';
import { Link } from "react-router-dom";

interface Friend {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  created_at: string;
}

interface Props {
  userId: number;
}

const declension = (number: number, titles: [string, string, string]) => {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return titles[2];
  if (n1 > 1 && n1 < 5) return titles[1];
  if (n1 === 1) return titles[0];
  return titles[2];
};

const timeAgo = (dateString: string) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
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

const FriendsList: React.FC<Props> = ({ userId }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const friendsListRef = useRef<HTMLDivElement | null>(null);

  const recalcMaxHeight = () => {
    if (!friendsListRef.current) return;

    const items = friendsListRef.current.querySelectorAll<HTMLElement>(
      `.${classes.friends_list_item}`
    );

    if (items.length === 0) return;

    const count = Math.min(3, items.length);

    const rootFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    const gap = rootFontSize;

    let height = 0;

    for (let i = 0; i < count; i++) {
      height += items[i].offsetHeight;
    }

    height += gap * (count - 1) + 1;

    friendsListRef.current.style.maxHeight = `${height}px`;
  };

useEffect(() => {
  const fetchFriends = async () => {
    try {
      const { data } = await axiosInstance.get(
        `/api/friends/all/${userId}`
      );

      setFriends(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Ошибка при загрузке друзей:", error);
      setFriends([]);
    } finally {
      setIsLoading(false);
    }
  };

  fetchFriends();
}, [userId]);

useEffect(() => {
  recalcMaxHeight();

  if (!friendsListRef.current) return;

  const firstItem = friendsListRef.current.querySelector<HTMLElement>(
    `.${classes.friends_list_item}`
  );

  if (!firstItem) return;

  const observer = new ResizeObserver(() => {
    requestAnimationFrame(recalcMaxHeight);
  });

  observer.observe(firstItem);

  window.addEventListener('resize', recalcMaxHeight);

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', recalcMaxHeight);
  };
}, [friends]);


  if (isLoading) {
    return <p>Загрузка друзей...</p>;
  }

  return (
    <section className={classes.friends_container}>
      <h2>Друзья:</h2>

      {friends.length > 0 ? (
        <div className={classes.friends_list} ref={friendsListRef}>
          {friends.map(friend => {
            const avatarSrc = friend.avatar
              ? friend.avatar.startsWith('/uploads/')
                ? `${API_URL}${friend.avatar}`
                : `${API_URL}/uploads/${friend.avatar}`
              : null;

            return (
              <div key={friend.id} className={classes.friends_list_item}>
                <Link to={`/user/${friend.username}`} className={classes.friend_list_img_con}>
                    {avatarSrc
                    ? <img src={avatarSrc} alt={friend.nickname || friend.username} />
                    : <Default />
                    }
                </Link>
                    <span>
                        <Link to={`/user/${friend.username}`} className={classes.friend_list_username_con}>
                            {friend.nickname || friend.username}
                        </Link>
                    </span>
                <p>в друзьях: {timeAgo(friend.created_at)}</p>
                <Mainbtn
                  variant="mini"
                  text="Открыть профиль"
                  href={`/user/${friend.username}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.friends_list_epmty}>
          <h3>Друзей не найдено</h3>
          <Mainbtn variant="mini" text="Пригласить в друзья" />
        </div>
      )}
    </section>
  );
};

export default FriendsList;
