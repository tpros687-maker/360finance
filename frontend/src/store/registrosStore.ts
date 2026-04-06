import { create } from "zustand";
import type { RegistroFilters } from "@/types/registros";

interface RegistrosState {
  filters: RegistroFilters;
  setFilters: (patch: Partial<RegistroFilters>) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: RegistroFilters = {
  page: 1,
  limit: 20,
};

export const useRegistrosStore = create<RegistrosState>((set) => ({
  filters: DEFAULT_FILTERS,

  setFilters: (patch) =>
    set((s) => ({
      filters: {
        ...s.filters,
        ...patch,
        // Reset to page 1 when any filter (except page) changes
        page: patch.page !== undefined ? patch.page : 1,
      },
    })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));
