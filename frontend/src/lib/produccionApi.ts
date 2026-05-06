import { api } from "./axios";
import type {
  LoteGanado, LoteCreate, LoteUpdate,
  EventoReproductivo, EventoCreate,
  CicloAgricola, CicloCreate, CicloUpdate,
} from "@/types/produccion";

// ── Lotes de ganado ───────────────────────────────────────────────────────────

export async function getLotes(potreroId: number): Promise<LoteGanado[]> {
  const res = await api.get<LoteGanado[]>(`/produccion/potreros/${potreroId}/lotes`);
  return res.data;
}

export async function createLote(potreroId: number, data: LoteCreate): Promise<LoteGanado> {
  const res = await api.post<LoteGanado>(`/produccion/potreros/${potreroId}/lotes`, data);
  return res.data;
}

export async function updateLote(loteId: number, data: LoteUpdate): Promise<LoteGanado> {
  const res = await api.put<LoteGanado>(`/produccion/lotes/${loteId}`, data);
  return res.data;
}

export async function deleteLote(loteId: number): Promise<void> {
  await api.delete(`/produccion/lotes/${loteId}`);
}

// ── Eventos reproductivos ─────────────────────────────────────────────────────

export async function getEventos(potreroId: number): Promise<EventoReproductivo[]> {
  const res = await api.get<EventoReproductivo[]>(`/produccion/potreros/${potreroId}/eventos`);
  return res.data;
}

export async function createEvento(potreroId: number, data: EventoCreate): Promise<EventoReproductivo> {
  const res = await api.post<EventoReproductivo>(`/produccion/potreros/${potreroId}/eventos`, data);
  return res.data;
}

export async function deleteEvento(eventoId: number): Promise<void> {
  await api.delete(`/produccion/eventos/${eventoId}`);
}

// ── Ciclos agrícolas ──────────────────────────────────────────────────────────

export async function getCiclos(potreroId: number): Promise<CicloAgricola[]> {
  const res = await api.get<CicloAgricola[]>(`/produccion/potreros/${potreroId}/ciclos`);
  return res.data;
}

export async function createCiclo(potreroId: number, data: CicloCreate): Promise<CicloAgricola> {
  const res = await api.post<CicloAgricola>(`/produccion/potreros/${potreroId}/ciclos`, data);
  return res.data;
}

export async function updateCiclo(cicloId: number, data: CicloUpdate): Promise<CicloAgricola> {
  const res = await api.put<CicloAgricola>(`/produccion/ciclos/${cicloId}`, data);
  return res.data;
}

export async function deleteCiclo(cicloId: number): Promise<void> {
  await api.delete(`/produccion/ciclos/${cicloId}`);
}
