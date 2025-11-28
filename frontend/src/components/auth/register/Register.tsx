// src/components/auth/register/Register.tsx
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { RegisterScheme } from "@/schemas/RegisterScheme";
import { InferType } from "yup";

type RegisterFormData = InferType<typeof RegisterScheme> & {
  code?: string;
};

interface ApiResponse {
  message: string;
  token?: string;
}

const API_URL = "http://localhost:3001";
// const API_URL = "/api";

const RegisterForm: React.FC = () => {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");

  const navigate = useNavigate();

  // --------------------------
  // Step 1: регистрация
  // --------------------------
  const {
    register: registerStep1,
    handleSubmit: handleSubmitStep1,
    watch: watchStep1,
    formState: { errors: errorsStep1 },
    reset: resetStep1,
  } = useForm<RegisterFormData>({
    resolver: yupResolver(RegisterScheme) as any,
    mode: "onChange",
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
      setServerMessage(null);

      await axios.post<ApiResponse>(`${API_URL}/auth/send-code`, {
        email: data.email,
        username: data.username,
      });

      setEmailValue(data.email);
      setUsernameValue(data.username);
      setStep(2);

      resetStep1();
      setServerMessage("Код подтверждения отправлен на почту");
    } catch (err: any) {
      setServerMessage(err?.response?.data?.message || "Ошибка сервера");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------
  // Step 2: подтверждение
  // --------------------------
  const {
    register: registerStep2,
    handleSubmit: handleSubmitStep2,
    watch: watchStep2,
    formState: { errors: errorsStep2 },
  } = useForm<RegisterFormData>({
    mode: "onBlur",
  });

  const code = watchStep2("code") || "";

  const submitRegistration: SubmitHandler<RegisterFormData> = async (data) => {
    try {
      setLoading(true);
      setServerMessage(null);

      const payload = {
        email: emailValue,
        username: usernameValue,
        password,
        code: data.code,
      };

      const res = await axios.post<ApiResponse>(`${API_URL}/auth/register`, payload);

      setServerMessage(res.data.message || "Успешная регистрация");
      navigate("/home");
    } catch (err: any) {
      setServerMessage(err?.response?.data?.message || "Неверный код подтверждения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {step === 1 && (
        <form onSubmit={handleSubmitStep1(sendCode)}>
          <div>
            <label>Email</label>
            <input
              type="email"
              {...registerStep1("email")}
              className={errorsStep1.email ? "error" : ""}
            />
            {errorsStep1.email && <p>{errorsStep1.email.message}</p>}
          </div>

          <div>
            <label>Username</label>
            <input
              type="text"
              {...registerStep1("username")}
              className={errorsStep1.username ? "error" : ""}
            />
            {errorsStep1.username && <p>{errorsStep1.username.message}</p>}
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              {...registerStep1("password")}
              className={errorsStep1.password ? "error" : ""}
            />
            {errorsStep1.password && <p>{errorsStep1.password.message}</p>}
          </div>

          <div>
            <label>Confirm Password</label>
            <input
              type="password"
              {...registerStep1("confirmPassword")}
              className={errorsStep1.confirmPassword ? "error" : ""}
            />
            {errorsStep1.confirmPassword && <p>{errorsStep1.confirmPassword.message}</p>}
          </div>

          <button type="submit" disabled={!canSendCode || loading}>
            {loading ? "Отправка..." : "Отправить код на почту"}
          </button>

          {serverMessage && <p>{serverMessage}</p>}
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmitStep2(submitRegistration)}>
          <div>
            <label>Код подтверждения</label>
            <input
              type="text"
              {...registerStep2("code", { required: "Код обязателен" })}
              placeholder="Введите код"
              className={errorsStep2.code ? "error" : ""}
            />
            {errorsStep2.code && <p>{errorsStep2.code.message}</p>}
          </div>

          <button type="submit" disabled={loading || !code}>
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </button>

          {serverMessage && <p>{serverMessage}</p>}
        </form>
      )}
    </>
  );
};

export default RegisterForm;
