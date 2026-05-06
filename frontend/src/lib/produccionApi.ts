import { apiFetch } from "./api";
import type {
  CicloAgricola,
  CicloCreate,
  CicloUpdate,
  EventoCreate,
  EventoReproductivo,
  LoteCreate,
  LoteGanado,
  LoteUpdate,
} from "@/types/produccion";

// ── Lotes de ganado ───────────────────────────────────────────────────────────

export const getLotes = (potreroId: number): Promise<LoteGanado[]> =>
  apiFetch(`/produccion/potreros/${potreroId}/lotes`);

export const createLote = (potreroId: number, data: LoteCreate): Promise<LoteGanado> =>
  apiFetch(`/produccion/potreros/${potreroId}/lotes`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateLote = (loteId: number, data: LoteUpdate): Promise<LoteGanado> =>
  apiFetch(`/produccion/lotes/${loteId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteLote = (loteId: number): Promise<void> =>
  apiFetch(`/produccion/lotes/${loteId}`, { method: "DELETE" });

// ── Eventos reproductivos ─────────────────────────────────────────────────────

export const getEventos = (potreroId: number): Promise<EventoReproductivo[]> =>
  apiFetch(`/produccion/potreros/${potreroId}/eventos`);

export const createEvento = (potreroId: number, data: EventoCreate): Promise<EventoReproductivo> =>
  apiFetch(`/produccion/potreros/${potreroId}/eventos`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deleteEvento = (eventoId: number): Promise<void> =>
  apiFetch(`/produccion/eventos/${eventoId}`, { method: "DELETE" });

// ── Ciclos agrícolas ──────────────────────────────────────────────────────────

export const getCiclos = (potreroId: number): Promise<CicloAgricola[]> =>
  apiFetch(`/produccion/potreros/${potreroId}/ciclos`);

export const createCiclo = (potreroId: number, data: CicloCreate): Promise<CicloAgricola> =>
  apiFetch(`/produccion/potreros/${potreroId}/ciclos`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateCiclo = (cicloId: number, data: CicloUpdate): Promise<CicloAgricola> =>
  apiFetch(`/produccion/ciclos/${cicloId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteCiclo = (cicloId: number): Promise<void> =>
  apiFetch(`/produccion/ciclos/${cicloId}`, { method: "DELETE" });
