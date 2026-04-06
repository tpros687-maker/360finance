import { create } from "zustand";
import type { Animal, MovimientoGanado, Potrero, PuntoInteres, TipoPunto } from "@/types/mapa";

interface MapaState {
  // Data
  potreros: Potrero[];
  puntos: PuntoInteres[];
  movimientos: MovimientoGanado[];

  // Selection
  selectedPotreroId: number | null;
  animalesByPotrero: Record<number, Animal[]>;

  // UI state
  panelOpen: boolean;
  movimientosPanelOpen: boolean;
  modalMovimientoOpen: boolean;
  activePuntoTool: TipoPunto | null;

  // Setters
  setPotreros: (potreros: Potrero[]) => void;
  addPotrero: (potrero: Potrero) => void;
  updatePotrero: (potrero: Potrero) => void;
  removePotrero: (id: number) => void;

  setPuntos: (puntos: PuntoInteres[]) => void;
  addPunto: (punto: PuntoInteres) => void;
  removePunto: (id: number) => void;

  setMovimientos: (movimientos: MovimientoGanado[]) => void;
  addMovimiento: (mov: MovimientoGanado) => void;
  updateMovimiento: (mov: MovimientoGanado) => void;

  setAnimalesForPotrero: (potreroId: number, animales: Animal[]) => void;
  addAnimalToPotrero: (potreroId: number, animal: Animal) => void;
  removeAnimalFromPotrero: (potreroId: number, animalId: number) => void;

  selectPotrero: (id: number | null) => void;
  setPanelOpen: (open: boolean) => void;
  setMovimientosPanelOpen: (open: boolean) => void;
  setModalMovimientoOpen: (open: boolean) => void;
  setActivePuntoTool: (tipo: TipoPunto | null) => void;
}

export const useMapaStore = create<MapaState>((set) => ({
  potreros: [],
  puntos: [],
  movimientos: [],
  selectedPotreroId: null,
  animalesByPotrero: {},
  panelOpen: false,
  movimientosPanelOpen: false,
  modalMovimientoOpen: false,
  activePuntoTool: null,

  setPotreros: (potreros) => set({ potreros }),
  addPotrero: (potrero) =>
    set((s) => ({ potreros: [...s.potreros, potrero] })),
  updatePotrero: (potrero) =>
    set((s) => ({
      potreros: s.potreros.map((p) => (p.id === potrero.id ? potrero : p)),
    })),
  removePotrero: (id) =>
    set((s) => ({
      potreros: s.potreros.filter((p) => p.id !== id),
      selectedPotreroId: s.selectedPotreroId === id ? null : s.selectedPotreroId,
      panelOpen: s.selectedPotreroId === id ? false : s.panelOpen,
    })),

  setPuntos: (puntos) => set({ puntos }),
  addPunto: (punto) => set((s) => ({ puntos: [...s.puntos, punto] })),
  removePunto: (id) => set((s) => ({ puntos: s.puntos.filter((p) => p.id !== id) })),

  setMovimientos: (movimientos) => set({ movimientos }),
  addMovimiento: (mov) => set((s) => ({ movimientos: [...s.movimientos, mov] })),
  updateMovimiento: (mov) =>
    set((s) => ({
      movimientos: s.movimientos.map((m) => (m.id === mov.id ? mov : m)),
    })),

  setAnimalesForPotrero: (potreroId, animales) =>
    set((s) => ({ animalesByPotrero: { ...s.animalesByPotrero, [potreroId]: animales } })),
  addAnimalToPotrero: (potreroId, animal) =>
    set((s) => ({
      animalesByPotrero: {
        ...s.animalesByPotrero,
        [potreroId]: [...(s.animalesByPotrero[potreroId] ?? []), animal],
      },
    })),
  removeAnimalFromPotrero: (potreroId, animalId) =>
    set((s) => ({
      animalesByPotrero: {
        ...s.animalesByPotrero,
        [potreroId]: (s.animalesByPotrero[potreroId] ?? []).filter((a) => a.id !== animalId),
      },
    })),

  selectPotrero: (id) => set({ selectedPotreroId: id, panelOpen: id !== null }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setMovimientosPanelOpen: (open) => set({ movimientosPanelOpen: open }),
  setModalMovimientoOpen: (open) => set({ modalMovimientoOpen: open }),
  setActivePuntoTool: (tipo) => set({ activePuntoTool: tipo }),
}));
