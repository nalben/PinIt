import * as yup from 'yup';

export const createRegisterScheme = (isEn = false) => yup.object().shape({
  username: yup
    .string()
    .matches(/^[a-zA-Z0-9_]+$/, isEn ? 'Only Latin letters, numbers and _ are allowed' : 'Только латинские буквы, цифры и _')
    .min(3, isEn ? 'Minimum 3 characters' : 'Минимум 3 символа')
    .max(20, isEn ? 'Maximum 20 characters' : 'Максимум 20 символов')
    .required(isEn ? 'Required field' : 'Необходимо заполнить'),
  email: yup
    .string()
    .email(isEn ? 'Invalid email format' : 'Неверный формат email')
    .required(isEn ? 'Required field' : 'Необходимо заполнить'),
  password: yup
    .string()
    .min(6, isEn ? 'Minimum 6 characters' : 'Минимум 6 символов')
    .required(isEn ? 'Required field' : 'Необходимо заполнить'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password'), null], isEn ? 'Passwords must match' : 'Пароли должны совпадать')
    .required(isEn ? 'Required field' : 'Необходимо заполнить')
});

export const RegisterScheme = createRegisterScheme(false);
