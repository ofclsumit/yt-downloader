/**
 * API configuration helper.
 * Supports VITE_API_URL environment variable for cross-origin backend deployments
 * (e.g. Render, Railway, Fly.io, or ngrok tunnel), while falling back to relative paths
 * for local development and proxying.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
