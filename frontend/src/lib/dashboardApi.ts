import { api } from "./axios";
import type { AlertaItem, DashboardResumen, FlujoCajaResponse, RecomendacionIA, ScoreSaludResponse } from "@/types/dashboard";

export async function getDashboardResumen(): Promise<DashboardResumen> {
  const res = await api.get<DashboardResumen>("/dashboard/resumen");
  return res.data;
}

export async function getFlujoCaja(): Promise<FlujoCajaResponse> {
  const res = await api.get<FlujoCajaResponse>("/dashboard/flujo-caja");
  return res.data;
}

export async function getAlertas(): Promise<AlertaItem[]> {
  const res = await api.get<AlertaItem[]>("/dashboard/alertas");
  return res.data;
}

export async function getRecomendaciones(): Promise<RecomendacionIA[]> {
  const res = await api.get<RecomendacionIA[]>("/dashboard/recomendaciones");
  return res.data;
}

export async function getScoreSalud(): Promise<ScoreSaludResponse> {
  const res = await api.get<ScoreSaludResponse>("/dashboard/score-salud");
  return res.data;
}
