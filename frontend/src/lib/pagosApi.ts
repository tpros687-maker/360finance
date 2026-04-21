import { api } from "./axios";
import type { PlanInfo } from "@/types/auth";

export interface PagoHistorial {
  id: number;
  monto: number;
  moneda: string;
  estado: string;
  mp_payment_id: string | null;
  created_at: string;
}

export async function getPlan(): Promise<PlanInfo> {
  const res = await api.get<PlanInfo>("/auth/plan");
  return res.data;
}

export async function getPagosHistorial(): Promise<PagoHistorial[]> {
  const res = await api.get<PagoHistorial[]>("/pagos/historial");
  return res.data;
}

export async function crearPreferencia(): Promise<{ init_point: string }> {
  const res = await api.post<{ init_point: string }>("/pagos/crear-preferencia");
  return res.data;
}
