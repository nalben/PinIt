// src/components/auth/register/Register.tsx
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { RegisterScheme } from "@/schemas/RegisterScheme";
import { InferType } from "yup";
import { API_URL } from "@/../axiosInstance";
import classes from "./Register.module.scss";

type RegisterFormData = InferType<typeof RegisterScheme> & {
  code?: string;
};

interface LoginResponse {
  token: string;
  username: string;
  id: number;
}

const RegisterForm: React.FC = () => {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [emailValue, setEmailValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  const navigate = useNavigate();

  // ==========================
  // STEP 1 — регистрация
  // ==========================
  const {
    register: registerStep1,
    handleSubmit: handleSubmitStep1,
    watch: watchStep1,
    formState: { errors: errorsStep1 },
    reset: resetStep1,
  } = useForm<RegisterFormData>({
    resolver: yupResolver(RegisterScheme) as any,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  const email = watchStep1("email") || "";
  const username = watchStep1("username") || "";
  const password = watchStep1("password") || "";
  const confirmPassword = watchStep1("confirmPassword") || "";

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

      await axios.post(`${API_URL}/auth/send-code`, {
        email: data.email,
        username: data.username,
      });

      setEmailValue(data.email);
      setUsernameValue(data.username);
      setPasswordValue(data.password);
      setStep(2);
      resetStep1();
    } catch (err: any) {
      setCodeError(err?.response?.data?.message || "Ошибка сервера");
      setTimeout(() => setCodeError(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  // ==========================
  // STEP 2 — подтверждение кода
  // ==========================
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

      // 1️⃣ Отправляем регистрацию
      await axios.post(`${API_URL}/auth/register`, {
        email: emailValue,
        username: usernameValue,
        password: passwordValue,
        code: data.code,
      });

      // 2️⃣ После успешной регистрации — логинимся автоматически
      const res = await axios.post<LoginResponse>(`${API_URL}/auth/login`, {
        username: usernameValue,
        password: passwordValue,
      });

      // 3️⃣ Сохраняем токен и данные пользователя
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("username", res.data.username);
      localStorage.setItem("userId", res.data.id.toString());

      navigate("/home");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || "Неверный код подтверждения";

      setCodeError(msg);
      setTimeout(() => setCodeError(null), 2500);
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
            <label>Адрес электронной почты</label>
            <input
              type="email"
              {...registerStep1("email")}
              placeholder="Введите Email"
              autoComplete="off"
              className={errorsStep1.email ? "error" : ""}
            />
            {errorsStep1.email && <p>{errorsStep1.email.message}</p>}
          </div>

          <div className={classes.form_item_row}>
            <label>Имя пользователя</label>
            <input
              type="text"
              {...registerStep1("username")}
              placeholder="Введите Username"
              autoComplete="off"
              className={errorsStep1.username ? "error" : ""}
            />
            {errorsStep1.username && <p>{errorsStep1.username.message}</p>}
          </div>

          <div className={classes.form_item_row}>
            <label>Пароль</label>
            <input
              type="password"
              {...registerStep1("password")}
              placeholder="Введите Пароль"
              autoComplete="off"
              className={errorsStep1.password ? "error" : ""}
            />
            {errorsStep1.password && <p>{errorsStep1.password.message}</p>}
          </div>

          <div className={classes.form_item_row}>
            <label>Подтверждение пароля</label>
            <input
              type="password"
              {...registerStep1("confirmPassword")}
              placeholder="Подтвердите пароль"
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
            {loading ? "Отправка кода..." : "Регистрация"}
          </button>

          {codeError && <p>{codeError}</p>}
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={handleSubmitStep2(submitRegistration)}
          className={classes.form_con_code}
        >
          <label>Подтвердите почту</label>

          <input
            type="text"
            {...registerStep2("code", { required: true })}
            placeholder="Введите код"
            autoComplete="off"
            className={codeError ? "error" : ""}
          />

          {codeError && <p>{codeError}</p>}

          <button
            type="submit"
            disabled={loading || !code}
            className={classes.form_item_button}
          >
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </button>
        </form>
      )}
    </>
  );
};

export default RegisterForm;
