// frontend api gateway client
// orchestrates http requests to the backend
// manages jwt persistence in localstorage
// handles token decoding and payload extraction
// provides unified error handling and response parsing
// resolves canonical user identity from session

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface TokenPayload {
  sub: string;
  username: string;
  iat?: number;
  exp?: number;
}

interface AuthMeResponse {
  username: string;
}

// browser execution check
function isClient(): boolean {
  return globalThis.window !== undefined;
}

// store jwt in localstorage for session persistence
export function getToken(): string | null {
  if (!isClient()) return null;
  return localStorage.getItem('gitanic_token');
}

export function setToken(token: string): void {
  if (isClient()) {
    localStorage.setItem('gitanic_token', token);
  }
}

export function clearToken(): void {
  if (isClient()) {
    localStorage.removeItem('gitanic_token');
  }
}


export function getTokenPayload(): TokenPayload | null {
  const token = getToken();
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as TokenPayload;
    if (!payload?.username || !payload?.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface ApiError {
  message: string;
  status: number;
}

class FetchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

export async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = 'API Request Failed';
    try {
      const data = await response.json();
      message = data.error || data.message || message;
    } catch {
      message = await response.text() || message;
    }
    throw new FetchError(response.status, message);
  }

  // handle 204 no content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export async function getCanonicalUsername(): Promise<string | null> {
  try {
    const me = await fetchApi<AuthMeResponse>('/api/auth/me');
    if (!me?.username) return null;
    return me.username;
  } catch {
    return null;
  }
}
