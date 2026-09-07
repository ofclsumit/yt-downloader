/**
 * Local Host API configuration helper.
 * Uses relative paths by default (proxied by Vite to http://127.0.0.1:3001)
 * or connects directly to the local backend on http://127.0.0.1:3001.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
