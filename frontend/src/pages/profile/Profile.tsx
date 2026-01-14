// Profile.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import classes from "./Profile.module.scss";
import axiosInstance from "../../../axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";

interface ProfileData {
  id: number;
  username: string;
  avatar?: string | null;
  role: string;
  isOwner: boolean;
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

  if (error === "NOT_FOUND") {
    return (
      <div className={classes.Profile_not_found}>
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

  return (
    <div className={classes.Profile}>
      <h1>{profile.username}</h1>

      {profile.avatar && <img src={profile.avatar} alt="avatar" />}

      {profile.isOwner ? (
        <p>Это ваш профиль</p>
      ) : (
        <p>Профиль пользователя</p>
      )}
    </div>
  );
};

export default Profile;
