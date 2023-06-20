import { CookieStorage } from 'cookie-storage';

const cookieStorage = new CookieStorage();

export const getLocalStorageItem = (key: string): unknown => {
  const item = window.localStorage.getItem(key);
  return item ? JSON.parse(item) : null;
};

export const setLocalStorageItem = (key: string, value: unknown): void => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const removeLocalStorageItem = (key: string): void => {
  window.localStorage.removeItem(key);
};

export const getSessionStorageItem = (key: string): string | null => {
  const item = window.sessionStorage.getItem(key);
  return item ? JSON.parse(item) : null;
};

export const setSessionStorageItem = (key: string, value: unknown): void => {
  window.sessionStorage.setItem(key, JSON.stringify(value));
};

export const removeSessionStorageItem = (key: string): void => {
  window.sessionStorage.removeItem(key);
};

export const getCookie = (key: string): unknown => {
  const item = cookieStorage.getItem(key);
  return item ? JSON.parse(item) : null;
};

export const setCookie = (key: string, value: unknown): void => {
  cookieStorage.setItem(key, JSON.stringify(value));
};

export const removeCookie = (key: string): void => {
  cookieStorage.removeItem(key);
};
