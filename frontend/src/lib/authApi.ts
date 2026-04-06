import { api } from "./axios";
import type { LoginRequest, RegisterRequest, TokenPair, User } from "@/types/auth";

export async function login(data: LoginRequest): Promise<TokenPair> {
  const res = await api.post<TokenPair>("/auth/login", data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<User> {
  const res = await api.post<User>("/auth/register", data);
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>("/auth/me");
  return res.data;
}

export function parseApiError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object"
  ) {
    const response = (error as { response: { data?: { detail?: unknown } } }).response;
    const detail = response.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  }
  return "Ocurrió un error inesperado";
}
