import { api } from "./axios";
import type { DashboardResumen } from "@/types/dashboard";

export async function getDashboardResumen(): Promise<DashboardResumen> {
  const res = await api.get<DashboardResumen>("/dashboard/resumen");
  return res.data;
}
