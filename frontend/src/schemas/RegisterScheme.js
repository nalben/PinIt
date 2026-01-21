import * as yup from 'yup';

export const RegisterScheme = yup.object().shape({
  username: yup
    .string()
    .matches(/^[a-zA-Z0-9_]+$/, 'Только латинские буквы, цифры и _')
    .min(3, 'Минимум 3 символа')
    .max(20, 'Максимум 20 символов')
    .required('Необходимо заполнить'),
  email: yup
    .string()
    .email('Неверный формат email')
    .required('Необходимо заполнить'),
  password: yup
    .string()
    .min(6, 'Минимум 6 символов')
    .required('Необходимо заполнить'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password'), null], 'Пароли должны совпадать')
    .required('Необходимо заполнить')
});
