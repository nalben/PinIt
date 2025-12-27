// src/components/auth/reset/ResetPasswordForm.tsx
import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import axios from "axios";
import { API_URL } from '@/../axiosInstance';
import classes from "./ResetPasswordForm.module.scss";
import { useLocation, useNavigate } from "react-router-dom";

interface ResetPasswordFormProps {
  onClose: () => void;
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

const Step1Schema = yup.object({
  username: yup.string().when("inputType", {
    is: "username",
    then: (schema) => schema.required("Введите логин"),
    otherwise: (schema) => schema.notRequired(),
  }),
  email: yup.string().email("Введите корректный email").when("inputType", {
    is: "email",
    then: (schema) => schema.required("Введите email"),
    otherwise: (schema) => schema.notRequired(),
  }),
  inputType: yup.mixed<"username" | "email">().oneOf(["username", "email"]).required(),
});

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
  const [inputType, setInputType] = useState<"username" | "email">("username");

  const navigate = useNavigate();
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
    resolver: yupResolver(Step1Schema) as any,
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
  }, [inputType]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
    }, 2000);
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

      const res = await axios.post<CheckResetUserResponse>(`${API_URL}/auth/check-reset-user`, payload);

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

  const {
    register: regStep2,
    handleSubmit: submitStep2,
    watch: watchStep2,
    formState: { errors: errorsStep2 },
  } = useForm<Step2Data>({ mode: "onBlur" });

  const code = (watchStep2("code") as string) || "";
  const canSubmitStep2 = !!code && !errorsStep2?.code;

  const handleStep2: SubmitHandler<Step2Data> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      await axios.post(`${API_URL}/auth/verify-reset-code`, { email: emailValue, code: data.code });

      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Неверный код");
    } finally {
      setLoading(false);
    }
  };

  const {
    register: regStep3,
    handleSubmit: submitStep3,
    watch: watchStep3,
    formState: { errors: errorsStep3 },
  } = useForm<Step3Data>({
    resolver: yupResolver(PasswordSchema) as any,
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

      const res = await axios.post<SetNewPasswordResponse>(`${API_URL}/auth/set-new-password`, {
        email: emailValue,
        password: data.password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("username", res.data.username);
      localStorage.setItem("userId", res.data.id.toString());

      onClose();

      if (location.pathname === "/welcome") {
        navigate("/home");
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || "Ошибка сервера");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (type: "username" | "email") => {
    setInputType(type);
  };

  return (
    <div className={`${classes.resetForm} ${classes.form_con_reset}`}>
      {step === 1 && (
        <form onSubmit={submitStep1(handleStep1)} noValidate className={`${classes.form1} ${classes.form_con_reset}`}>
          <h2>Восстановление пароля</h2>

          <div className={classes.toggleButtons}>
            <button
              type="button"
              className={inputType === "username" ? classes.active : "toggle_active_reset"}
              onClick={() => handleToggle("username")}
            >
              Имя пользователя
            </button>
            <button
              type="button"
              className={inputType === "email" ? classes.active : "toggle_active_reset"}
              onClick={() => handleToggle("email")}
            >
              Адрес электронной почты
            </button>
          </div>

          <input type="hidden" {...regStep1("inputType")} />

          {inputType === "username" && (
            <div className={classes.form_item_row}>
              <label>Имя пользователя</label>
              <input
                type="text"
                {...regStep1("username")}
                placeholder="Введите имя пользователя"
                autoComplete="off"
                className={errorsStep1.username ? "error" : ""}
              />
              {errorsStep1.username && <p className={classes.error}>{errorsStep1.username.message}</p>}
            </div>
          )}

          {inputType === "email" && (
            <div className={classes.form_item_row}>
              <label>Адрес электронной почты</label>
              <input
                type="text"
                {...regStep1("email")}
                placeholder="Введите адрес электронной почты"
                autoComplete="off"
                className={errorsStep1.email ? "error" : ""}
              />
              {errorsStep1.email && <p className={classes.error}>{errorsStep1.email.message}</p>}
            </div>
          )}

          {error && <p className={classes.error}>{error}</p>}

          <button type="submit" disabled={loading || !canSubmitStep1} className={classes.form_item_button}>
            {loading ? "Отправка..." : "Далее"}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitStep2(handleStep2)} className={`${classes.form2} ${classes.form_con_reset}`}>
          <h2>Введите код с почты</h2>
          <p>Код отправлен на почту {maskedEmail}</p>
          <div className={classes.form_item_row}>
            <input type="text" {...regStep2("code")} placeholder="Введите код" autoComplete="off" />
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading || !canSubmitStep2} className={classes.form_item_button}>
            {loading ? "Проверка..." : "Далее"}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submitStep3(handleStep3)} className={classes.form_con_reset}>
          <h2>Введите новый пароль</h2>
          <div className={classes.form_item_row}>
            <input type="password" {...regStep3("password")} placeholder="Новый пароль" autoComplete="off" />
            {errorsStep3.password && <p className={classes.error}>{errorsStep3.password.message}</p>}
          </div>
          <div className={classes.form_item_row}>
            <input type="password" {...regStep3("confirmPassword")} placeholder="Подтвердите пароль" autoComplete="off" />
            {errorsStep3.confirmPassword && <p className={classes.error}>{errorsStep3.confirmPassword.message}</p>}
          </div>
          {error && <p className={classes.error}>{error}</p>}
          <button type="submit" disabled={loading || !canSubmitStep3} className={classes.form_item_button}>
            {loading ? "Сохранение..." : "Сменить пароль"}
          </button>
        </form>
      )}
    </div>
  );
};

export default ResetPasswordForm;
