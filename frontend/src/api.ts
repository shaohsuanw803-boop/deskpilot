import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocale, translate as t, useI18n } from './i18n';

export type Data = Record<string, any>;
export type User = {
  id: string;
  name: string;
  name_en?: string;
  role: string;
  department: string;
  department_en?: string;
};
export function displayUserName(user: User): string {
  return getLocale() === 'en' ? user.name_en || user.name : user.name;
}
export type Bootstrap = {
  mode: string;
  user: User;
  users: User[];
  summary: Record<string, number>;
  config: Data;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T = Data>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  const headers = new Headers(options?.headers);
  headers.set('Accept-Language', getLocale());
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      t(
        '无法连接服务。请确认后端已启动，然后重试。',
        'Cannot connect. Check that the backend is running, then retry.',
      ),
    );
  }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const detail =
      typeof body?.detail === 'string'
        ? body.detail
        : body?.detail
          ? JSON.stringify(body.detail)
          : t(`请求失败（${response.status}）`, `Request failed (${response.status})`);
    throw new ApiError(detail, response.status);
  }
  return body as T;
}
export const get = <T = Data>(path: string) => request<T>(path);
export const post = <T = Data>(path: string, body: Data = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

// Preserve one pending intent across transport failures, without persisting user text.
// A successful response completes it; a later deliberate submission gets a new key.
export function createRunSubmitter() {
  let pending: { fingerprint: string; key: string } | undefined;
  return async (userId: string, body: Data): Promise<Data> => {
    const fingerprint = JSON.stringify([userId, body]);
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, key: crypto.randomUUID() };
    }
    const attempt = pending;
    const result = await request('/runs', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': attempt.key },
    });
    if (pending === attempt) pending = undefined;
    return result;
  };
}
export const patch = <T = Data>(path: string, body: Data) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const remove = (path: string) => request(path, { method: 'DELETE' });
export const sid = (id: unknown) => encodeURIComponent(String(id));
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : t('操作失败，请重试。', 'The operation failed. Please retry.');
}
export function array(value: unknown): Data[] {
  return Array.isArray(value) ? value : [];
}
export function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
export function date(value?: string, full = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleString(
        getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US',
        full
          ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
          : { month: '2-digit', day: '2-digit' },
      );
}
export const isStaff = (user: User) => ['it', 'admin'].includes(user.role);
export function useResource<T>(path: string | null, revision = 0) {
  const { locale } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const reload = useCallback(async () => {
    const token = ++serial.current;
    if (!path) {
      setLoading(false);
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await get<T>(path);
      if (serial.current === token) setData(result);
    } catch (e) {
      if (serial.current === token) setError(errorText(e));
    } finally {
      if (serial.current === token) setLoading(false);
    }
  }, [path, locale]);
  useEffect(() => {
    void reload();
    return () => {
      serial.current++;
    };
  }, [reload, revision]);
  return { data, loading, error, reload, setData };
}
