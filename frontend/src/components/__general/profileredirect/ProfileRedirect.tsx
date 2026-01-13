import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ProfileRedirect = (): JSX.Element | null => {
  const navigate = useNavigate();

  useEffect(() => {
    const username = localStorage.getItem("username");

    if (username) {
      navigate(`/user/${username}`, { replace: true });
    } else {
      navigate("/home", { replace: true });
    }
  }, [navigate]);

  return null;
};

export default ProfileRedirect;
