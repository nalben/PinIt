import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import classes from "./Profile.module.scss";
import axiosInstance from "../../../axiosInstance";

interface ProfileData {
  id: number;
  username: string;
  avatar?: string | null;
  role: string;
  isOwner: boolean;
}

type ProfileError = "NOT_FOUND" | "UNKNOWN";

const Profile = () => {
  const { username } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const url = username
          ? `/api/profile/${username}`
          : `/api/profile`;

        const { data } = await axiosInstance.get<ProfileData>(url);

        if (username && data.isOwner) {
          navigate("/profile", { replace: true });
          return;
        }

        setProfile(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError("NOT_FOUND");
        } else {
          setError("UNKNOWN");
        }
      }
    };

    fetchProfile();
  }, [username, navigate]);

  if (error === "NOT_FOUND") {
    return (
      <div className={classes.Profile}>
        <h1>Пользователь не найден</h1>
        <p>Возможно, он был удалён или вы ошиблись в имени.</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className={classes.Profile}>
      <h1>{profile.username}</h1>

      {profile.avatar && (
        <img src={profile.avatar} alt="avatar" />
      )}

      {profile.isOwner ? (
        <p>Это ваш профиль</p>
      ) : (
        <p>Профиль пользователя</p>
      )}
    </div>
  );
};

export default Profile;
