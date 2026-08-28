import { create } from 'zustand';
import type { TossExchange } from '../lib/ipc';

export interface SelectedStock {
  symbol: string;
  name: string;
  market: TossExchange;
}

interface SelectedStockState {
  selected: SelectedStock | null;
  select: (stock: SelectedStock) => void;
  clear: () => void;
}

export const useSelectedStockStore = create<SelectedStockState>()((set) => ({
  selected: null,
  select: (stock) => set({ selected: stock }),
  clear: () => set({ selected: null }),
}));
