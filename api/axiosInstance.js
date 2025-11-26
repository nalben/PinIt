// src/api/axiosInstance.js
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://77.105.129.150:3001";

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
