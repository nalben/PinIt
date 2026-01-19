import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import classes from "./Profile.module.scss";
import axiosInstance from "../../../axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Logo from '@/assets/icons/colored/Logo.svg'
import Default from '@/assets/icons/monochrome/default-user.svg'

interface ProfileData {
  id: number;
  avatar?: string | null;
  role: string;
  isOwner: boolean;
  username: string;
  nickname?: string | null;
  
}

type ProfileError = "NOT_FOUND" | "UNKNOWN";

const Profile = () => {
  const { username } = useParams<{ username: string }>();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);

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
      }
    };

    if (username) fetchProfile();
  }, [username]);

useEffect(() => {
  if (!profile) return;

  const titleName = profile.nickname || profile.username;
  document.title = `${titleName} | PinIt`;
}, [profile]);

  if (error === "NOT_FOUND") {
    return (
      <div className={classes.profile_not_found}>
        <h1>Пользователь <span>{username}</span> не найден</h1>
        <p>Возможно, он был удалён или вы ошиблись в имени.</p>
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
            <div>
              <p>Друзей: 1</p>
              <div className={classes.owner_btns}>
                share edit
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