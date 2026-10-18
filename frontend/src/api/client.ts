// Shared fetch wrapper: attaches auth headers, parses the API's error envelope,
// and transparently retries once after a token refresh on 401.

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  status: number;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = shape.code || 'UNKNOWN_ERROR';
    this.details = shape.details;
    this.requestId = shape.requestId;
  }
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

type TokenGetter = () => string | null;
type RefreshFn = () => Promise<string | null>;
type UnauthorizedFn = () => void;

let getAccessToken: TokenGetter = () => null;
let refreshAccessToken: RefreshFn = async () => null;
let onUnauthorized: UnauthorizedFn = () => {};

export function configureApiClient(opts: {
  getAccessToken: TokenGetter;
  refreshAccessToken: RefreshFn;
  onUnauthorized: UnauthorizedFn;
}) {
  getAccessToken = opts.getAccessToken;
  refreshAccessToken = opts.refreshAccessToken;
  onUnauthorized = opts.onUnauthorized;
}

type QueryParams = { [key: string]: string | number | boolean | undefined | null };

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
  stepUpToken?: string;
  skipAuth?: boolean;
  isFormData?: boolean;
  signal?: AbortSignal;
  rawResponse?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE_URL + path, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  return url.pathname + url.search;
}

async function parseErrorBody(res: Response): Promise<ApiErrorShape> {
  try {
    const json = await res.json();
    if (json && json.error) return json.error as ApiErrorShape;
    return { code: 'UNKNOWN_ERROR', message: json?.message || res.statusText };
  } catch {
    return { code: 'UNKNOWN_ERROR', message: res.statusText || 'Request failed' };
  }
}

async function doFetch(path: string, options: RequestOptions, attempt = 0): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (!options.isFormData) headers['Content-Type'] = 'application/json';
  if (!options.skipAuth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.stepUpToken) headers['X-Step-Up-Token'] = options.stepUpToken;

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method || 'GET',
    headers,
    body: options.body
      ? options.isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body)
      : undefined,
    signal: options.signal,
  });

  if (res.status === 401 && !options.skipAuth && attempt === 0) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return doFetch(path, options, attempt + 1);
    }
    onUnauthorized();
  }

  return res;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await doFetch(path, options);
  if (options.rawResponse) return res as unknown as T;
  if (!res.ok) {
    const shape = await parseErrorBody(res);
    throw new ApiError(res.status, shape);
  }
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, query?: QueryParams, opts: RequestOptions = {}) =>
    apiRequest<T>(path, { ...opts, method: 'GET', query }),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts: RequestOptions = {}) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};
