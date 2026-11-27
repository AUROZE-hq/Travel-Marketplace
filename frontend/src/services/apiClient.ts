import axios, { type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
});

// In-memory token storage (never written to localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (err: unknown) => void;
}> = [];

let onAuthFailureCallback: (() => void) | null = null;

export function setAuthTokens(accessToken: string | null, refreshToken: string | null): void {
  inMemoryAccessToken = accessToken;
  inMemoryRefreshToken = refreshToken;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function getRefreshToken(): string | null {
  return inMemoryRefreshToken;
}

export function setOnAuthFailure(callback: () => void): void {
  onAuthFailureCallback = callback;
}

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor attaches in-memory access token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryAccessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

// Response interceptor handles concurrency-safe 401 refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt refresh on credential and password-reset endpoints.
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/password-reset');
    const isLogout = originalRequest?.url?.includes('/auth/logout');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        originalRequest._retry = true;
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              if (isLogout) originalRequest.data = JSON.stringify({ refreshToken: inMemoryRefreshToken });
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(
          `${baseURL}/auth/refresh`,
          inMemoryRefreshToken ? { refreshToken: inMemoryRefreshToken } : {},
          { headers: { 'Content-Type': 'application/json' }, timeout: 10_000, withCredentials: true },
        );

        const newAccessToken = refreshResponse.data?.data?.accessToken;
        const newRefreshToken = refreshResponse.data?.data?.refreshToken;
        if (typeof newAccessToken !== 'string' || typeof newRefreshToken !== 'string') {
          throw new Error('Invalid refresh response');
        }

        setAuthTokens(newAccessToken, newRefreshToken);
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        if (isLogout) originalRequest.data = JSON.stringify({ refreshToken: newRefreshToken });
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAuthTokens(null, null);
        if (onAuthFailureCallback) {
          onAuthFailureCallback();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
