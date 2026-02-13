import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

const AppInit: React.FC = () => {
  const bootstrap = useAuthStore(state => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return null;
};

export default AppInit;
