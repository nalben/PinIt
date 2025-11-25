import * as yup from 'yup';

export const LoginScheme = yup.object().shape({
  username: yup
    .string()
    .required('Обязательно'),
  password: yup
    .string()
    .required('Обязательно')
});
