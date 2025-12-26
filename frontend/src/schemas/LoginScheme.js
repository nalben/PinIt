import * as yup from 'yup';

export const LoginScheme = yup.object().shape({
  username: yup
    .string()
    .required('Необходимо заполнить'),
  password: yup
    .string()
    .required('Необходимо заполнить')
});
