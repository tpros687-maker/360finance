import { apiFetch } from "./api";
import type {
  Lote,
  LoteCreate,
  LoteDetalle,
  MovimientoCreate,
  DivisionCreate,
  VentaCreate,
} from "@/types/lotes";

export const getLotes = (params?: {
  cerrado?: boolean;
  potrero_id?: number;
}): Promise<Lote[]> => {
  const qs = new URLSearchParams();
  if (params?.cerrado !== undefined) qs.set("cerrado", String(params.cerrado));
  if (params?.potrero_id !== undefined) qs.set("potrero_id", String(params.potrero_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/lotes${suffix}`);
};

export const createLote = (body: LoteCreate): Promise<Lote> =>
  apiFetch("/lotes", { method: "POST", body: JSON.stringify(body) });

export const getLote = (id: number): Promise<LoteDetalle> =>
  apiFetch(`/lotes/${id}`);

export const moverLote = (id: number, body: MovimientoCreate): Promise<Lote> =>
  apiFetch(`/lotes/${id}/mover`, { method: "POST", body: JSON.stringify(body) });

export const dividirLote = (id: number, body: DivisionCreate): Promise<Lote> =>
  apiFetch(`/lotes/${id}/dividir`, { method: "POST", body: JSON.stringify(body) });

export const venderLote = (id: number, body: VentaCreate): Promise<Lote> =>
  apiFetch(`/lotes/${id}/vender`, { method: "POST", body: JSON.stringify(body) });
