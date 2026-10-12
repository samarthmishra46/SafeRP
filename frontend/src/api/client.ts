import type { HeatmapResponse, Place, PlanRequest, PlanResponse } from './types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the SafeRP server. Check your connection.', 0, 'network');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      error?.message ?? `The server responded with ${response.status}.`,
      response.status,
      error?.code ?? 'error',
    );
  }
  return body as T;
}

/** `country` is an ISO alpha-2 code, or '' to search worldwide. */
export function searchPlaces(q: string, country: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q, country });
  return request<{ results: Place[] }>(`/api/geocode?${params}`, { signal }).then((r) => r.results);
}

export function planTrip(body: PlanRequest): Promise<PlanResponse> {
  return request<PlanResponse>('/api/plan', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchHeatmap(bbox: number[], signal?: AbortSignal): Promise<HeatmapResponse> {
  const params = new URLSearchParams({ bbox: bbox.map((v) => v.toFixed(4)).join(',') });
  return request<HeatmapResponse>(`/api/heatmap?${params}`, { signal });
}
