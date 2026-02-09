// src/components/auth/login/Login.tsx
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { LoginScheme } from "@/schemas/LoginScheme";
import { InferType } from "yup";
import { API_URL } from '@/api/axiosInstance';
import classes from './Login.module.scss';
import Close from '@/assets/icons/monochrome/close.svg';
import Open from '@/assets/icons/monochrome/open.svg';
import { useAuthStore } from '@/store/authStore';

type LoginFormData = InferType<typeof LoginScheme>;

interface ApiResponse {
  message: string;
  token?: string;
  username?: string;
  id?: number;
  avatar?: string;
  email?: string;
}

interface LoginFormProps {
  onOpenReset?: () => void;
  onOpenRegister?: () => void;
  onClose?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({
  onOpenReset,
  onOpenRegister,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore(state => state.login);

  const navigate = useNavigate();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<LoginFormData>({
    resolver: yupResolver(LoginScheme) as any,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  const username = watch("username") || "";
  const password = watch("password") || "";
  const canSubmit = username && password && !errors.username && !errors.password;

  const onSubmit: SubmitHandler<LoginFormData> = async (data) => {
    try {
      setLoading(true);
      setServerMessage(null);

      const res = await axios.post<ApiResponse>(`${API_URL}/api/auth/login`, data);

      const { token, username, id } = res.data;

      if (token && id && username) {
        localStorage.setItem("token", token);
        localStorage.setItem("userId", String(id));
        localStorage.setItem("username", username);
        login({ id, username, avatar: res.data.avatar, email: res.data.email });
        window.location.reload();
      }


    } catch (err: any) {
      setServerMessage(err?.response?.data?.message || "Ошибка при логине");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenReset) onOpenReset();
  };
  const handleOpenRegister = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenRegister) onOpenRegister();
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className={classes.form_con_log}>
      <div className={classes.form_item_row}>
        <label>Логин</label>
        <input
          type="text"
          {...register("username")}
          // autoComplete="off"
          placeholder="Введите логин"
          className={errors.username ? "error" : ""}
        />
        {errors.username && <p>{errors.username.message}</p>}
      </div>

      <div className={classes.form_item_row} style={{ position: "relative" }}>
        <label>Пароль</label>
        <input
          type={showPassword ? "text" : "password"}
          {...register("password")}
          // autoComplete="off"
          placeholder="Введите пароль"
          className={errors.password ? "error" : ""}
        />
        <span onClick={() => setShowPassword(prev => !prev)}>
          {showPassword ? <Open /> : <Close />}
        </span>

        {errors.password && <p>{errors.password.message}</p>}

        <button
          type="button"
          className={classes.forgotPassword}
          onClick={handleForgotPassword}
        >
          Забыли пароль?
        </button>
        <button
          type="button"
          className={classes.link}
          onClick={handleOpenRegister}
        >
          Зарегистрироваться
        </button>
      </div>

      <button type="submit" disabled={!canSubmit || loading} className={classes.form_item_button}>
        {loading ? "Вход..." : "Войти"}
      </button>

      {serverMessage && <p>{serverMessage}</p>}
    </form>
  );
};

export default LoginForm;



