import { apiFetch } from "./api";
import type {
  CicloAgricola,
  CicloCreate,
  CicloUpdate,
  EventoCreate,
  EventoReproductivo,
} from "@/types/produccion";

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
