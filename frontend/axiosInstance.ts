import axios from "axios";
import isLocal from "./isLocal";

export const API_URL: string = isLocal
  ? "http://localhost:3001"
  : "http://77.105.129.150/api";

const axiosInstance = axios.create({
  baseURL: API_URL,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default axiosInstance;
