import { CookieStorage } from 'cookie-storage';
const cookieStorage = new CookieStorage();
export const getLocalStorageItem = (key) => {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
};
export const setLocalStorageItem = (key, value) => {
    window.localStorage.setItem(key, JSON.stringify(value));
};
export const removeLocalStorageItem = (key) => {
    window.localStorage.removeItem(key);
};
export const getSessionStorageItem = (key) => {
    const item = window.sessionStorage.getItem(key);
    return item ? JSON.parse(item) : null;
};
export const setSessionStorageItem = (key, value) => {
    window.sessionStorage.setItem(key, JSON.stringify(value));
};
export const removeSessionStorageItem = (key) => {
    window.sessionStorage.removeItem(key);
};
export const getCookie = (key) => {
    const item = cookieStorage.getItem(key);
    return item ? JSON.parse(item) : null;
};
export const setCookie = (key, value) => {
    cookieStorage.setItem(key, JSON.stringify(value));
};
export const removeCookie = (key) => {
    cookieStorage.removeItem(key);
};
//# sourceMappingURL=storage-utils.js.map