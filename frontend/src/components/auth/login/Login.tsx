// src/components/auth/login/Login.tsx
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { LoginScheme } from "@/schemas/LoginScheme";
import { InferType } from "yup";

type LoginFormData = InferType<typeof LoginScheme>;

interface ApiResponse {
  message: string;
  token?: string;
  username?: string;
  id?: number;
}

const LoginForm: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: yupResolver(LoginScheme) as any,
    mode: "onChange" // валидация в реальном времени
  });

  const username = watch("username") || "";
  const password = watch("password") || "";

  const canSubmit = username && password && !errors.username && !errors.password;

  const onSubmit: SubmitHandler<LoginFormData> = async (data) => {
    try {
      setLoading(true);
      setServerMessage(null);

      const res = await axios.post<ApiResponse>(
        "http://localhost:3001/auth/login",
        data
      );

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

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Username</label>
        <input
          type="text"
          {...register("username")}
          className={errors.username ? "error" : ""}
        />
        {errors.username && <p>{errors.username.message}</p>}
      </div>

      <div>
        <label>Password</label>
        <input
          type="password"
          {...register("password")}
          className={errors.password ? "error" : ""}
        />
        {errors.password && <p>{errors.password.message}</p>}
      </div>

      <button type="submit" disabled={!canSubmit || loading}>
        {loading ? "Вход..." : "Войти"}
      </button>

      {serverMessage && <p>{serverMessage}</p>}
    </form>
  );
};

export default LoginForm;
