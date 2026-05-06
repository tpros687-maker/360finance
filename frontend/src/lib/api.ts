import { api } from "./axios";

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const data = init?.body ? JSON.parse(init.body as string) : undefined;
  const res = await api.request<T>({ url: path, method, data });
  return res.data;
}
