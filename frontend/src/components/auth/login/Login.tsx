// src/components/auth/login/Login.tsx
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { LoginScheme } from "@/schemas/LoginScheme";
import { InferType } from "yup";
import { API_URL } from '@/../axiosInstance';
import classes from './Login.module.scss';
import Close from '@/assets/icons/monochrome/close.svg';
import Open from '@/assets/icons/monochrome/open.svg';

type LoginFormData = InferType<typeof LoginScheme>;

interface ApiResponse {
  message: string;
  token?: string;
  username?: string;
  id?: number;
}

// Callback родителя для открытия reset-модалки
interface LoginFormProps {
  onOpenReset?: () => void;
}
interface LoginFormProps {
  onOpenReset?: () => void;
  onOpenRegister?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({
  onOpenReset,
  onOpenRegister
}) => {
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

      const res = await axios.post<ApiResponse>(`${API_URL}/auth/login`, data);

      localStorage.setItem("token", res.data.token || "");
      localStorage.setItem("username", res.data.username || "");
      localStorage.setItem("userId", res.data.id?.toString() || "");

      navigate("/home");
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
        <label>Имя пользователя</label>
        <input
          type="text"
          {...register("username")}
          autoComplete="off"
          placeholder="Введите имя пользователя"
          className={errors.username ? "error" : ""}
        />
        {errors.username && <p>{errors.username.message}</p>}
      </div>

      <div className={classes.form_item_row} style={{ position: "relative" }}>
        <label>Пароль</label>
        <input
          type={showPassword ? "text" : "password"}
          {...register("password")}
          autoComplete="off"
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
