export interface User {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
}

export interface ApiError {
  detail: string | { msg: string; type: string }[];
}
