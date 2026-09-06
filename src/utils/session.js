/**
 * Production Temporary Per-Video Session Utilities & API Integration
 */

import { apiUrl } from '../config/api';

const TOKEN_PREFIX = 'tp_sess_token_';

/**
 * Retrieves the local session ownership token from sessionStorage.
 */
export function getSessionToken(sessionId) {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    return window.sessionStorage.getItem(TOKEN_PREFIX + sessionId);
  } catch (e) {
    return null;
  }
}

/**
 * Stores the session ownership token in sessionStorage.
 */
export function setSessionToken(sessionId, token) {
  if (typeof window === 'undefined' || !sessionId || !token) return;
  try {
    window.sessionStorage.setItem(TOKEN_PREFIX + sessionId, token);
  } catch (e) {
    // Ignore storage quota errors
  }
}

/**
 * Removes the session ownership token from sessionStorage.
 */
export function removeSessionToken(sessionId) {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    window.sessionStorage.removeItem(TOKEN_PREFIX + sessionId);
  } catch (e) {}
}

/**
 * Creates a new temporary video session on the server.
 * Returns { ok, session, error, status }
 */
export async function createVideoSession(url) {
  try {
    const res = await fetch(apiUrl('/api/session/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.detail || 'Failed to create video session.',
      };
    }

    if (data.sessionId && data.sessionToken) {
      setSessionToken(data.sessionId, data.sessionToken);
    }

    return {
      ok: true,
      status: 200,
      session: data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'Network error connecting to server.',
    };
  }
}

/**
 * Fetches the current session state and validates its active status.
 * Returns { ok, session, status, error }
 */
export async function fetchSessionDetails(sessionId) {
  if (!sessionId) {
    return { ok: false, status: 'not_found', error: 'Invalid session ID' };
  }

  try {
    const res = await fetch(apiUrl(`/api/session/${encodeURIComponent(sessionId)}`), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (res.status === 404) {
      return { ok: false, status: 'not_found', error: 'Session not found' };
    }

    if (res.status === 410) {
      return { ok: false, status: 'expired', error: 'Session expired' };
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.detail || 'Could not fetch session.',
      };
    }

    if (data.status === 'expired') {
      return { ok: false, status: 'expired', error: 'Session expired' };
    }

    return {
      ok: true,
      status: 'active',
      session: data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'network_error',
      error: 'Network connection issue. Will retry.',
    };
  }
}

/**
 * Dispatches a lightweight activity ping / timestamp update to extend the 5-minute session window.
 */
export async function sendSessionActivity(sessionId, token, activityData = {}) {
  if (!sessionId) return null;
  const ownerToken = token || getSessionToken(sessionId);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (ownerToken) {
      headers['X-Session-Token'] = ownerToken;
    }

    const res = await fetch(apiUrl(`/api/session/${encodeURIComponent(sessionId)}/activity`), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        token: ownerToken,
        ...activityData,
      }),
    });

    if (res.status === 410) {
      return { ok: false, status: 'expired' };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    return null;
  }
}

/**
 * Cleanly closes the active session on the server.
 */
export async function closeSession(sessionId, token, jobId = null) {
  if (!sessionId) return;
  const ownerToken = token || getSessionToken(sessionId);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (ownerToken) headers['X-Session-Token'] = ownerToken;

    await fetch(apiUrl(`/api/session/${encodeURIComponent(sessionId)}/close`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: ownerToken, jobId }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}

  removeSessionToken(sessionId);
}

/**
 * Dispatches an asynchronous beacon to clean up server resources
 * (cancels running jobs, deletes orphaned temp files) on tab close, reload, or 5-min timeout.
 */
export function sendSessionCleanupBeacon(sessionId, jobId) {
  if (!sessionId && !jobId) return;

  const payload = JSON.stringify({ sessionId, jobId });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon(apiUrl('/api/session/cleanup'), blob);
      if (ok) return;
    } catch (e) {}
  }

  try {
    fetch(apiUrl('/api/session/cleanup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (err) {}
}
