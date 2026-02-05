import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const ProfileRedirect = (): JSX.Element | null => {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const isInitialized = useAuthStore(state => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) return;

    if (user?.username) {
      navigate(`/user/${user.username}`, { replace: true });
    } else {
      navigate("/home", { replace: true });
    }
  }, [navigate, user, isInitialized]);

  return null;
};

export default ProfileRedirect;
