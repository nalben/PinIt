// src/components/auth/register/Register.tsx
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import axios from "axios";
import { createRegisterScheme, RegisterScheme } from "@/schemas/RegisterScheme";
import { InferType } from "yup";
import { API_URL } from "@/api/axiosInstance";
import classes from "./Register.module.scss";
import Close from '@/assets/icons/monochrome/close.svg';
import Open from '@/assets/icons/monochrome/open.svg';
import { useAuthStore } from '@/store/authStore';
import { useLanguageStore } from '@/store/languageStore';

type RegisterFormData = InferType<typeof RegisterScheme> & {
  code?: string;
};

interface LoginResponse {
  token: string;
  username: string;
  id: number;
  avatar?: string | null;
  email?: string | null;
}

interface RegisterFormProps {
  onClose?: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onClose }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const login = useAuthStore(state => state.login);
  const bootstrap = useAuthStore(state => state.bootstrap);
  const language = useLanguageStore((state) => state.language);
  const isEn = language === 'en';
  const registerScheme = createRegisterScheme(isEn);

  const [emailValue, setEmailValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  const {
    register: registerStep1,
    handleSubmit: handleSubmitStep1,
    watch: watchStep1,
    formState: { errors: errorsStep1 },
    reset: resetStep1,
  } = useForm<RegisterFormData>({
    resolver: yupResolver(registerScheme) as any,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  const email = watchStep1("email") || "";
  const username = watchStep1("username") || "";
  const password = watchStep1("password") || "";
  const confirmPassword = watchStep1("confirmPassword") || "";
  const [showPassword, setShowPassword] = useState(false);
  const canSendCode =
    !errorsStep1.email &&
    !errorsStep1.username &&
    !errorsStep1.password &&
    !errorsStep1.confirmPassword &&
    email &&
    username &&
    password &&
    confirmPassword;

  const sendCode: SubmitHandler<RegisterFormData> = async (data) => {
    try {
      setLoading(true);
      setCodeError(null);

      await axios.post(`${API_URL}/api/auth/send-code`, {
        email: data.email,
        username: data.username,
      });

      setEmailValue(data.email);
      setUsernameValue(data.username);
      setPasswordValue(data.password);
      setStep(2);
      resetStep1();
    } catch (err: any) {
      setCodeError(err?.response?.data?.message || (isEn ? "Server error" : "Ошибка сервера"));
      setTimeout(() => setCodeError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const {
    register: registerStep2,
    handleSubmit: handleSubmitStep2,
    watch: watchStep2,
  } = useForm<RegisterFormData>({
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  const code = watchStep2("code") || "";

  const submitRegistration: SubmitHandler<RegisterFormData> = async (data) => {
    try {
      setLoading(true);
      setCodeError(null);

      await axios.post(`${API_URL}/api/auth/register`, {
        email: emailValue,
        username: usernameValue,
        password: passwordValue,
        code: data.code,
      });

      const res = await axios.post<LoginResponse>(`${API_URL}/api/auth/login`, {
        username: usernameValue,
        password: passwordValue,
      });

      localStorage.setItem("token", res.data.token);
      login({
        id: res.data.id,
        username: res.data.username,
        avatar: res.data.avatar,
        email: res.data.email ?? undefined,
      });
      onClose?.();
      bootstrap();

    } catch (err: any) {
      const msg =
        err?.response?.data?.message || (isEn ? "Invalid verification code" : "Неверный код подтверждения");

      setCodeError(msg);
      setTimeout(() => setCodeError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {step === 1 && (
        <form
          onSubmit={handleSubmitStep1(sendCode)}
          className={classes.form_con_reg}
        >
          <div className={classes.form_item_row}>
            <label>{isEn ? 'Email address' : 'Адрес электронной почты'}</label>
            <input
              type="email"
              {...registerStep1("email")}
              placeholder={isEn ? 'Enter email address' : 'Введите адрес электронной почты'}
              className={errorsStep1.email ? "error" : ""}
            />
            {errorsStep1.email && <p>{errorsStep1.email.message}</p>}
          </div>

          <div className={classes.form_item_row}>
            <label>{isEn ? 'Username' : 'Логин'}</label>
            <input
              type="text"
              {...registerStep1("username")}
              placeholder={isEn ? 'Enter username' : 'Введите логин'}
              className={errorsStep1.username ? "error" : ""}
            />
            {errorsStep1.username && <p>{errorsStep1.username.message}</p>}
          </div>

          <div className={`${classes.form_item_row} ${classes.anchor_input}`}>
            <label>{isEn ? 'Password' : 'Пароль'}</label>
            <input
              type={showPassword ? "text" : "password"}
              {...registerStep1("password")}
              placeholder={isEn ? 'Enter password' : 'Введите пароль'}
              className={errorsStep1.password ? "error" : ""}
            />
            <span onClick={() => setShowPassword(prev => !prev)}>
              {showPassword ? <Open /> : <Close />}
            </span>
            {errorsStep1.password && <p>{errorsStep1.password.message}</p>}
          </div>

          <div className={classes.form_item_row}>
            <label>{isEn ? 'Confirm password' : 'Подтверждение пароля'}</label>
            <input
              type="password"
              {...registerStep1("confirmPassword")}
              placeholder={isEn ? 'Confirm password' : 'Подтвердите пароль'}
              autoComplete="off"
              className={errorsStep1.confirmPassword ? "error" : ""}
            />
            {errorsStep1.confirmPassword && (
              <p>{errorsStep1.confirmPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSendCode || loading}
            className={classes.form_item_button}
          >
            {loading ? (isEn ? "Sending code..." : "Отправка кода...") : (isEn ? "Continue" : "Регистрация")}
          </button>

          {codeError && <p>{codeError}</p>}
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={handleSubmitStep2(submitRegistration)}
          className={classes.form_con_code}
        >
          <label>{isEn ? 'Verify email' : 'Подтвердите почту'}</label>

          <input
            type="text"
            {...registerStep2("code", { required: true })}
            placeholder={isEn ? 'Enter code' : 'Введите код'}
            autoComplete="off"
            className={codeError ? "error" : ""}
          />

          {codeError && <p>{codeError}</p>}

          <button
            type="submit"
            disabled={loading || !code}
            className={classes.form_item_button}
          >
            {loading ? (isEn ? "Creating account..." : "Регистрация...") : (isEn ? "Create account" : "Зарегистрироваться")}
          </button>
        </form>
      )}
    </>
  );
};

export default RegisterForm;
