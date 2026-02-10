import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Default from '@/assets/icons/monochrome/default-user.svg';
import classes from './Friendlist.module.scss';
import { useFriendsStore } from "@/store/friendsStore";
import { useAuthStore } from "@/store/authStore";
import { API_URL } from "@/api/axiosInstance";
import { connectSocket } from "@/services/socketManager";
import AuthTrigger from "../auth/AuthTrigger";

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

const FriendsList: React.FC = () => {
  const friendsListRef = useRef<HTMLDivElement | null>(null);
  const { user, isAuth } = useAuthStore();
  const { friends, isLoading, fetchFriends } = useFriendsStore();

useEffect(() => {
  if (localStorage.getItem('debugFriends') === '1') return;
  if (user && user.id >= 0) {
    fetchFriends(user.id);
  }
}, [user, fetchFriends]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = connectSocket({
      onFriendStatusChange: () => {
        if (localStorage.getItem('debugFriends') === '1') return;
        fetchFriends(user.id);
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [user, fetchFriends]);


  useEffect(() => {
    if (!friendsListRef.current) return;

    const recalcMaxHeight = () => {
      if (!friendsListRef.current) return;
      const items = friendsListRef.current.querySelectorAll<HTMLElement>(
        `.${classes.friends_list_item}`
      );
      if (!items.length) return;

      const count = Math.min(3, items.length);
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const gap = rootFontSize;

      let height = 0;
      for (let i = 0; i < count; i++) height += items[i].offsetHeight;
      height += gap * (count - 1) + 1;

      friendsListRef.current.style.maxHeight = `${height}px`;
    };


    recalcMaxHeight();
    const observer = new ResizeObserver(() => requestAnimationFrame(recalcMaxHeight));
    observer.observe(friendsListRef.current);
    window.addEventListener('resize', recalcMaxHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recalcMaxHeight);
    };
  }, [friends]);

  if (!isAuth) {
    return (
      <section className={classes.friends_container}>
        <h2>Друзья:</h2>
        <div className={classes.friends_list_epmty}>
          <h3>Войдите, чтобы увидеть друзей</h3>
          <AuthTrigger type='login'>
            <Mainbtn variant="mini" text="Войти" />
          </AuthTrigger>
        </div>
      </section>
    );
  }

  if (isLoading) return <p>Загрузка друзей...</p>;

  return (
    <section className={classes.friends_container}>
      <h2>Друзья:</h2>
      {friends.length ? (
        <div className={classes.friends_list} ref={friendsListRef}>
          {friends.map(friend => {
            const avatarSrc = friend.avatar
              ? `${API_URL}/uploads/${friend.avatar.replace(/^\/uploads\//, '')}`
              : null;

            return (
              <div key={friend.id} className={classes.friends_list_item}>
                <Link to={`/user/${friend.username}`} className={classes.friend_list_img_con}>
                  {avatarSrc ? <img src={avatarSrc} alt={friend.nickname || friend.username} /> : <Default />}
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
                  kind="navlink"
                  href={`/user/${friend.username}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.friends_list_epmty}>
          <h3>Вы пока не добавили своих друзей</h3>
          <Mainbtn variant="mini" text="Пригласить в друзья" />
        </div>
      )}
    </section>
  );
};

export default FriendsList;
