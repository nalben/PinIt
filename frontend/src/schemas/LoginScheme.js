import * as yup from 'yup';

export const createLoginScheme = (isEn = false) => yup.object().shape({
  username: yup
    .string()
    .required(isEn ? 'Required field' : 'Необходимо заполнить'),
  password: yup
    .string()
    .required(isEn ? 'Required field' : 'Необходимо заполнить')
});

export const LoginScheme = createLoginScheme(false);
