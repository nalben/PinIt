// src/components/auth/login/Login.tsx
import React, { useEffect, useRef, useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import axios from "axios";
import { createLoginScheme, LoginScheme } from "@/schemas/LoginScheme";
import { InferType } from "yup";
import { API_URL } from '@/api/axiosInstance';
import classes from './Login.module.scss';
import Close from '@/assets/icons/monochrome/close.svg';
import Open from '@/assets/icons/monochrome/open.svg';
import { useAuthStore } from '@/store/authStore';
import { useLanguageStore } from '@/store/languageStore';

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
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const login = useAuthStore(state => state.login);
  const bootstrap = useAuthStore(state => state.bootstrap);
  const language = useLanguageStore((state) => state.language);
  const isEn = language === 'en';
  const loginScheme = createLoginScheme(isEn);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginScheme) as any,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });
  const usernameRegister = register("username");
  const passwordRegister = register("password");

  const username = watch("username") || "";
  const password = watch("password") || "";
  const canSubmit = username && password && !errors.username && !errors.password;

  useEffect(() => {
    const syncAutofilledFields = () => {
      const nextUsername = usernameInputRef.current?.value ?? "";
      const nextPassword = passwordInputRef.current?.value ?? "";

      if (nextUsername !== getValues("username")) {
        setValue("username", nextUsername, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      }

      if (nextPassword !== getValues("password")) {
        setValue("password", nextPassword, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      }
    };

    const timeoutIds = [0, 120, 350].map((delay) => window.setTimeout(syncAutofilledFields, delay));
    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [getValues, setValue]);

  const onSubmit: SubmitHandler<LoginFormData> = async (data) => {
    try {
      setLoading(true);
      setServerMessage(null);

      const res = await axios.post<ApiResponse>(`${API_URL}/api/auth/login`, data);

      const { token, username, id } = res.data;

      if (token && id && username) {
        localStorage.setItem("token", token);
        login({ id, username, avatar: res.data.avatar, email: res.data.email });
        onClose?.();
        bootstrap();
      }
    } catch (err: any) {
      setServerMessage(err?.response?.data?.message || (isEn ? "Sign-in error" : "Ошибка при входе"));
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
        <label>{isEn ? 'Username' : 'Логин'}</label>
        <input
          type="text"
          {...usernameRegister}
          autoComplete="username"
          placeholder={isEn ? 'Enter username' : 'Введите логин'}
          className={errors.username ? "error" : ""}
          ref={(node) => {
            usernameRegister.ref(node);
            usernameInputRef.current = node;
          }}
        />
        {errors.username && <p>{errors.username.message}</p>}
      </div>

      <div className={classes.form_item_row} style={{ position: "relative" }}>
        <label>{isEn ? 'Password' : 'Пароль'}</label>
        <input
          type={showPassword ? "text" : "password"}
          {...passwordRegister}
          autoComplete="current-password"
          placeholder={isEn ? 'Enter password' : 'Введите пароль'}
          className={errors.password ? "error" : ""}
          ref={(node) => {
            passwordRegister.ref(node);
            passwordInputRef.current = node;
          }}
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
          {isEn ? 'Forgot password?' : 'Забыли пароль?'}
        </button>
        <button
          type="button"
          className={classes.link}
          onClick={handleOpenRegister}
        >
          {isEn ? 'Create account' : 'Зарегистрироваться'}
        </button>
      </div>

      <button type="submit" disabled={!canSubmit || loading} className={classes.form_item_button}>
        {loading ? (isEn ? "Signing in..." : "Вход...") : (isEn ? "Sign in" : "Войти")}
      </button>

      {serverMessage && <p>{serverMessage}</p>}
    </form>
  );
};

export default LoginForm;
