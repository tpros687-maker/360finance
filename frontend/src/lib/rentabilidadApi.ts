import { apiFetch } from "./api";
import type {
  ImputacionSugerida,
  PotreroRentabilidad,
  PotreroRentabilidadDetalle,
  ProyeccionAnual,
  ReimputarGastoBody,
} from "@/types/rentabilidad";

interface PeriodoParams {
  fecha_desde?: string;
  fecha_hasta?: string;
}

function buildQuery(params: PeriodoParams): string {
  const qs = new URLSearchParams();
  if (params.fecha_desde) qs.set("fecha_desde", params.fecha_desde);
  if (params.fecha_hasta) qs.set("fecha_hasta", params.fecha_hasta);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const getRentabilidadPotreros = (
  params: PeriodoParams = {}
): Promise<PotreroRentabilidad[]> =>
  apiFetch(`/rentabilidad/potreros${buildQuery(params)}`);

export const getRentabilidadPotrero = (
  id: number,
  params: PeriodoParams = {}
): Promise<PotreroRentabilidadDetalle> =>
  apiFetch(`/rentabilidad/potreros/${id}${buildQuery(params)}`);

export const getProyeccionAnual = (): Promise<ProyeccionAnual> =>
  apiFetch("/rentabilidad/proyeccion");

export const sugerirImputacion = (body: {
  categoria_id: number;
  fecha: string;
}): Promise<ImputacionSugerida | null> =>
  apiFetch("/rentabilidad/sugerir-imputacion", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const reimputarGasto = (
  registroId: number,
  body: ReimputarGastoBody
): Promise<unknown> =>
  apiFetch(`/registros/${registroId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
