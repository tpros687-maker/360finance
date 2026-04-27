import { api } from "./axios";
import type { DashboardResumen, FlujoCajaResponse } from "@/types/dashboard";

export async function getDashboardResumen(): Promise<DashboardResumen> {
  const res = await api.get<DashboardResumen>("/dashboard/resumen");
  return res.data;
}

export async function getFlujoCaja(): Promise<FlujoCajaResponse> {
  const res = await api.get<FlujoCajaResponse>("/dashboard/flujo-caja");
  return res.data;
}
