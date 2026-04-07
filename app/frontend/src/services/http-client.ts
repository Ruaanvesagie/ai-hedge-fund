const API_KEY_STORAGE_KEY = 'smartkonnect_api_key';
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const isBrowser = () => typeof window !== 'undefined';

export const getStoredApiKey = (): string => {
  if (!isBrowser()) {
    return '';
  }
  return window.localStorage.getItem(API_KEY_STORAGE_KEY) || '';
};

export const setStoredApiKey = (value: string) => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(API_KEY_STORAGE_KEY, value);
};

export const clearStoredApiKey = () => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
};

export const authorizedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers || {});
  const apiKey = getStoredApiKey();
  if (apiKey) {
    headers.set('X-API-Key', apiKey);
  }
  return fetch(input, {
    ...init,
    headers,
  });
};

export const appendAuthHeaders = (headers: HeadersInit = {}): Headers => {
  const merged = new Headers(headers);
  const apiKey = getStoredApiKey();
  if (apiKey) {
    merged.set('X-API-Key', apiKey);
  }
  return merged;
};

export { API_KEY_STORAGE_KEY };
