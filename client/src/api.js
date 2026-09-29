const API_BASE = '/api';

export function getToken() { return localStorage.getItem('zotrix_token') || ''; }
export function setToken(token) { localStorage.setItem('zotrix_token', token); }
export function clearToken() { localStorage.removeItem('zotrix_token'); }

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* no json */ }
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('zotrix:logout'));
  }
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export function downloadText(text, filename, type='text/plain') {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

export const API_URL = API_BASE;
