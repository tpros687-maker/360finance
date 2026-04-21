export interface User {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  perfil: string;
  es_productor: boolean;
  es_negocio: boolean;
  onboarding_completado: boolean;
  nombre_campo: string | null;
  departamento: string | null;
  moneda: string;
  plan: string;
  trial_inicio: string | null;
  trial_fin: string | null;
  suscripcion_id: string | null;
  dias_restantes: number | null;
  vencido: boolean;
  created_at: string;
}

export interface PlanInfo {
  plan: string;
  trial_inicio: string | null;
  trial_fin: string | null;
  dias_restantes: number | null;
  vencido: boolean;
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
  perfil?: string;
}

export interface ApiError {
  detail: string | { msg: string; type: string }[];
}
