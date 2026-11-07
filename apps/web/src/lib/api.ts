import { createClient } from '@/lib/supabase/client';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}, key?: string): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw new ApiError(401, 'Your session expired. Sign in again.');
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(key ? { 'X-AI-Key': key } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      'Cannot reach the Verbalist API. Check the backend connection, then retry.',
    );
  }
  const result = await response.json().catch(() => null);
  if (response.status === 401) await createClient().auth.signOut({ scope: 'local' });
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof result?.detail === 'string'
        ? result.detail
        : 'This request could not be completed. Please retry.',
    );
  return result as T;
}
export function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
