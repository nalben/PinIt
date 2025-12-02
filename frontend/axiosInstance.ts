// src/api/axiosInstance.js
import axios from "axios";
import isLocal  from './isLocal'

export const API_URL: string = isLocal
  ? 'http://localhost:3001'
  : 'https://pin-it.ru/api';

const axiosInstance = axios.create({
  baseURL: API_URL,
});

// Интерцептор для автоматической подстановки токена
axiosInstance.interceptors.request.use(
  function (config) {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  },
  function (error) {
    return Promise.reject(error);
  }
);

export default axiosInstance;
