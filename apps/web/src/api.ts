const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const sessionKey = 'payflow.session';

export interface User {
  id: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Payment {
  id: string;
  amountMinor: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FAILED' | 'TIMEOUT';
  providerReference: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let refreshPromise: Promise<void> | null = null;

export function getApiDocsUrl(): string {
  return `${apiBaseUrl}/docs`;
}

export function getSession(): StoredSession | null {
  const value = sessionStorage.getItem(sessionKey);
  if (!value) return null;

  try {
    const session: StoredSession = JSON.parse(value);
    if (typeof session.accessToken !== 'string' || typeof session.refreshToken !== 'string') {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function setSession(session: Pick<AuthSession, 'accessToken' | 'refreshToken'>): void {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({ accessToken: session.accessToken, refreshToken: session.refreshToken }),
  );
}

export function clearSession(): void {
  sessionStorage.removeItem(sessionKey);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  return request<AuthSession>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string): Promise<AuthSession> {
  return request<AuthSession>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getUserProfile(): Promise<User> {
  return request<User>('/v1/auth/me');
}

export async function listPayments(): Promise<Payment[]> {
  return request<Payment[]>('/v1/payments');
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = getSession();
  const publicAuthRequest = ['/v1/auth/login', '/v1/auth/register', '/v1/auth/refresh'].includes(path);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (!publicAuthRequest && session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique se o backend está em execução.', 0);
  }

  if (response.status === 401 && retry && session?.refreshToken && !publicAuthRequest) {
    try {
      await refreshSession();
      return request<T>(path, init, false);
    } catch {
      clearSession();
      throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
    }
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function refreshSession(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const session = getSession();
    if (!session?.refreshToken) throw new ApiError('Refresh token não disponível.', 401);

    const response = await fetch(`${apiBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) {
      throw new ApiError(await readErrorMessage(response), response.status);
    }

    const tokens = (await response.json()) as Pick<AuthSession, 'accessToken' | 'refreshToken'>;
    setSession(tokens);
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (body.message) return body.message;
  } catch {
    return `A solicitação falhou (${response.status}).`;
  }
  return `A solicitação falhou (${response.status}).`;
}
