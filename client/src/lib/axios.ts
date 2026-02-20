import axios from 'axios';
import { API_BASE } from '../config';

// Create an Axios instance with base configuration
const api = axios.create({
    baseURL: `${API_BASE}/api`,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to attach the Bearer token to every request
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Optional: Interceptor to handle global 401 Unauthorized responses
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Only force logout if we are not already on the login page and it's not a purposely unauthenticated request
            const currentPath = window.location.pathname;
            if (currentPath !== '/login' && !error.config.url?.includes('/auth/')) {
                console.warn('Unauthorized request intercepted. Logging out...');
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
