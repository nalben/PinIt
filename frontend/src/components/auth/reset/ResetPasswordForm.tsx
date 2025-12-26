import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import axios from "axios";
import { API_URL } from '@/../axiosInstance';
import classes from "./ResetPasswordForm.module.scss";

interface ResetPasswordFormProps {
  onClose: () => void;
}

interface Step1Data {
  username?: string;
  email?: string;
}

interface Step2Data {
  code: string;
}

interface Step3Data {
  password: string;
  confirmPassword: string;
}

interface CheckResetUserResponse {
  email: string;
  maskedEmail: string;
}

interface SetNewPasswordResponse {
  token: string;
  username: string;
  id: number;
}

// ----------------- STEP 3 Schema -----------------
const PasswordSchema: yup.ObjectSchema<Step3Data> = yup.object({
  password: yup.string().min(6, "Минимум 6 символов").required("Обязательное поле"),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref("password")], "Пароли не совпадают")
    .required("Обязательное поле"),
});

const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({ onClose }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [emailValue, setEmailValue] = useState("");

  // ----------------- STEP 1 -----------------
  const { register: regStep1, handleSubmit: submitStep1 } = useForm<Step1Data>({ mode: "onBlur" });
  const handleStep1: SubmitHandler<Step1Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.post<CheckResetUserResponse>(`${API_URL}/auth/check-reset-user`, data);
      setEmailValue(res.data.email);
      setMaskedEmail(res.data.maskedEmail);

      await axios.post(`${API_URL}/auth/send-reset-code`, { email: res.data.email });

      setStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Ошибка сервера");
    } finally {
      setLoading(false);
    }
  };

  // ----------------- STEP 2 -----------------
  const { register: regStep2, handleSubmit: submitStep2 } = useForm<Step2Data>({ mode: "onBlur" });
  const handleStep2: SubmitHandler<Step2Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      await axios.post(`${API_URL}/auth/verify-reset-code`, {
        email: emailValue,
        code: data.code
      });

      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Неверный или истёкший код");
    } finally {
      setLoading(false);
    }
  };

  // ----------------- STEP 3 -----------------
    const { register: regStep3, handleSubmit: submitStep3, formState: { errors } } = useForm<Step3Data>({
    resolver: yupResolver(PasswordSchema) as any,
    mode: "onBlur",
    defaultValues: {
        password: "",
        confirmPassword: "",
    },
    });
  const handleStep3: SubmitHandler<Step3Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.post<SetNewPasswordResponse>(`${API_URL}/auth/set-new-password`, {
        email: emailValue,
        password: data.password
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("username", res.data.username);
      localStorage.setItem("userId", res.data.id.toString());

      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Ошибка сервера");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={classes.resetForm}>
      {step === 1 && (
        <form onSubmit={submitStep1(handleStep1)}>
          <h2>Восстановление пароля</h2>
          <div className={classes.form_item_row}>
            <label>Логин или Email</label>
            <input type="text" {...regStep1("username")} placeholder="Введите логин или email" />
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Отправка..." : "Далее"}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitStep2(handleStep2)}>
          <h2>Введите код с почты</h2>
          <p>На почту <strong>{maskedEmail}</strong> отправлен код</p>
          <div className={classes.form_item_row}>
            <input type="text" {...regStep2("code")} placeholder="Введите код" />
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Проверка..." : "Далее"}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submitStep3(handleStep3)}>
          <h2>Новый пароль</h2>
          <div className={classes.form_item_row}>
            <input type="password" {...regStep3("password")} placeholder="Новый пароль" />
            {errors.password && <p className={classes.error}>{errors.password.message}</p>}
          </div>
          <div className={classes.form_item_row}>
            <input type="password" {...regStep3("confirmPassword")} placeholder="Подтвердите пароль" />
            {errors.confirmPassword && <p className={classes.error}>{errors.confirmPassword.message}</p>}
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Сохранение..." : "Сменить пароль"}
          </button>
        </form>
      )}
    </div>
  );
};

export default ResetPasswordForm;
