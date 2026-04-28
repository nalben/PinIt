// src/components/auth/reset/ResetPasswordForm.tsx
import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import axios from "axios";
import { API_URL } from '@/api/axiosInstance';
import classes from "./ResetPasswordForm.module.scss";
import { useLocation } from "react-router-dom";
import { useLanguageStore } from '@/store/languageStore';

interface ResetPasswordFormProps {
  onClose: () => void;
  initialStep?: 1 | 2 | 3;
  initialUsername?: string;
}

interface Step1Data {
  username?: string;
  email?: string;
  inputType?: "username" | "email";
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

const createStep1Schema = (isEn: boolean) => yup.object({
  username: yup.string().when("inputType", {
    is: "username",
    then: (schema) => schema.required(isEn ? "Enter username" : "Введите логин"),
    otherwise: (schema) => schema.notRequired(),
  }),
  email: yup.string().email(isEn ? "Enter a valid email" : "Введите корректный email").when("inputType", {
    is: "email",
    then: (schema) => schema.required(isEn ? "Enter email" : "Введите email"),
    otherwise: (schema) => schema.notRequired(),
  }),
  inputType: yup.mixed<"username" | "email">().oneOf(["username", "email"]).required(),
});

const createPasswordSchema = (isEn: boolean): yup.ObjectSchema<Step3Data> => yup.object({
  password: yup.string().min(6, isEn ? "Minimum 6 characters" : "Минимум 6 символов").required(isEn ? "Required field" : "Обязательное поле"),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref("password")], isEn ? "Passwords do not match" : "Пароли не совпадают")
    .required(isEn ? "Required field" : "Обязательное поле"),
});

const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({ onClose, initialStep = 1, initialUsername }) => {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [inputType, setInputType] = useState<"username" | "email">("username");
  const language = useLanguageStore((state) => state.language);
  const isEn = language === 'en';
  const step1Schema = createStep1Schema(isEn);
  const passwordSchema = createPasswordSchema(isEn);

  const location = useLocation();

  const {
    register: regStep1,
    handleSubmit: submitStep1,
    setValue,
    clearErrors,
    formState: { errors: errorsStep1 },
    watch: watchStep1,
  } = useForm<Step1Data>({
    mode: "onBlur",
    resolver: yupResolver(step1Schema) as any,
    defaultValues: { username: "", email: "", inputType: "username" },
  });

  const username = (watchStep1("username") as string) || "";
  const email = (watchStep1("email") as string) || "";
  const canSubmitStep1 =
    (inputType === "username" ? !!username && !errorsStep1.username : !!email && !errorsStep1.email);

  useEffect(() => {
    setValue("inputType", inputType, { shouldValidate: true, shouldDirty: false });
    if (inputType === "username") {
      setValue("email", "");
      clearErrors("email");
    } else {
      setValue("username", "");
      clearErrors("username");
    }
  }, [clearErrors, inputType, setValue]);

  useEffect(() => {
    if (initialStep !== 2 || !initialUsername) return;

    const fetchEmailAndSendCode = async () => {
      try {
        setLoading(true);
        const res = await axios.post<CheckResetUserResponse>(`${API_URL}/api/auth/check-reset-user`, {
          inputType: "username",
          username: initialUsername
        });

        setEmailValue(res.data.email);
        setMaskedEmail(res.data.maskedEmail);
        await axios.post(`${API_URL}/api/auth/send-reset-code`, { email: res.data.email });
      } catch (err: any) {
        setError(err?.response?.data?.message || (isEn ? "Server error" : "Ошибка сервера"));
      } finally {
        setLoading(false);
      }
    };

    void fetchEmailAndSendCode();
  }, [initialStep, initialUsername, isEn]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 2000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleStep1: SubmitHandler<Step1Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      const payload: Step1Data = {
        inputType: data.inputType || inputType,
        username: data.username,
        email: data.email,
      };

      const res = await axios.post<CheckResetUserResponse>(`${API_URL}/api/auth/check-reset-user`, payload);

      setEmailValue(res.data.email);
      setMaskedEmail(res.data.maskedEmail);

      await axios.post(`${API_URL}/api/auth/send-reset-code`, { email: res.data.email });

      setStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.message || (isEn ? "Server error" : "Ошибка сервера"));
    } finally {
      setLoading(false);
    }
  };

  const { register: regStep2, handleSubmit: submitStep2, watch: watchStep2, formState: { errors: errorsStep2 } } =
    useForm<Step2Data>({ mode: "onBlur" });

  const code = (watchStep2("code") as string) || "";
  const canSubmitStep2 = !!code && !errorsStep2?.code;

  const handleStep2: SubmitHandler<Step2Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      await axios.post(`${API_URL}/api/auth/verify-reset-code`, { email: emailValue, code: data.code });

      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message || (isEn ? "Invalid code" : "Неверный код"));
    } finally {
      setLoading(false);
    }
  };

  const { register: regStep3, handleSubmit: submitStep3, watch: watchStep3, formState: { errors: errorsStep3 } } =
    useForm<Step3Data>({
      resolver: yupResolver(passwordSchema) as any,
      mode: "onBlur",
      defaultValues: { password: "", confirmPassword: "" },
    });

  const password = (watchStep3("password") as string) || "";
  const confirmPassword = (watchStep3("confirmPassword") as string) || "";
  const canSubmitStep3 = !!password && !!confirmPassword && !errorsStep3?.password && !errorsStep3?.confirmPassword;

  const handleStep3: SubmitHandler<Step3Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.post<SetNewPasswordResponse>(`${API_URL}/api/auth/set-new-password`, {
        email: emailValue,
        password: data.password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("username", res.data.username);
      localStorage.setItem("userId", res.data.id.toString());

      onClose();

      if (location.pathname === "/welcome") {
        window.location.href = "/home";
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || (isEn ? "Server error" : "Ошибка сервера"));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (type: "username" | "email") => setInputType(type);

  return (
    <div className={`${classes.resetForm} ${classes.form_con_reset}`}>
      {step === 1 && (
        <form onSubmit={submitStep1(handleStep1)} noValidate className={`${classes.form1} ${classes.form_con_reset}`}>
          <h2>{isEn ? 'Reset password' : 'Восстановление пароля'}</h2>

          <div className={classes.toggleButtons}>
            <button
              type="button"
              className={inputType === "username" ? classes.active : "toggle_active_reset"}
              onClick={() => handleToggle("username")}
            >
              {isEn ? 'Username' : 'Логин'}
            </button>
            <button
              type="button"
              className={inputType === "email" ? classes.active : "toggle_active_reset"}
              onClick={() => handleToggle("email")}
            >
              {isEn ? 'Email' : 'Почта'}
            </button>
          </div>

          <input type="hidden" {...regStep1("inputType")} />

          {inputType === "username" && (
            <div className={classes.form_item_row}>
              <label>{isEn ? 'Username' : 'Логин'}</label>
              <input
                type="text"
                {...regStep1("username")}
                placeholder={isEn ? 'Enter username' : 'Введите логин'}
                className={errorsStep1.username ? "error" : ""}
              />
              {errorsStep1.username && <p className={classes.error}>{errorsStep1.username.message}</p>}
            </div>
          )}

          {inputType === "email" && (
            <div className={classes.form_item_row}>
              <label>{isEn ? 'Email' : 'Почта'}</label>
              <input
                type="text"
                {...regStep1("email")}
                placeholder={isEn ? 'Enter email address' : 'Введите адрес электронной почты'}
                className={errorsStep1.email ? "error" : ""}
              />
              {errorsStep1.email && <p className={classes.error}>{errorsStep1.email.message}</p>}
            </div>
          )}

          {error && <p className={classes.error}>{error}</p>}

          <button type="submit" disabled={loading || !canSubmitStep1} className={classes.form_item_button}>
            {loading ? (isEn ? "Sending..." : "Отправка...") : (isEn ? "Next" : "Далее")}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitStep2(handleStep2)} className={`${classes.form2} ${classes.form_con_reset}`}>
          <h2>{isEn ? 'Enter email code' : 'Введите код с почты'}</h2>
          <p>{isEn ? `Code sent to ${maskedEmail}` : `Код отправлен на почту ${maskedEmail}`}</p>
          <div className={classes.form_item_row}>
            <input type="text" {...regStep2("code")} placeholder={isEn ? 'Enter code' : 'Введите код'} autoComplete="off" />
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading || !canSubmitStep2} className={classes.form_item_button}>
            {loading ? (isEn ? "Checking..." : "Проверка...") : (isEn ? "Next" : "Далее")}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submitStep3(handleStep3)} className={classes.form_con_reset}>
          <h2>{isEn ? 'Set new password' : 'Введите новый пароль'}</h2>
          <div className={classes.form_item_row}>
            <input type="password" {...regStep3("password")} placeholder={isEn ? 'New password' : 'Новый пароль'} autoComplete="off" />
            {errorsStep3.password && <p className={classes.error}>{errorsStep3.password.message}</p>}
          </div>
          <div className={classes.form_item_row}>
            <input type="password" {...regStep3("confirmPassword")} placeholder={isEn ? 'Confirm password' : 'Подтвердите пароль'} autoComplete="off" />
            {errorsStep3.confirmPassword && <p className={classes.error}>{errorsStep3.confirmPassword.message}</p>}
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading || !canSubmitStep3} className={classes.form_item_button}>
            {loading ? (isEn ? "Saving..." : "Сохранение...") : (isEn ? "Change password" : "Сменить пароль")}
          </button>
        </form>
      )}
    </div>
  );
};

export default ResetPasswordForm;
