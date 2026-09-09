"use client";

import { create } from "zustand";

type LayoutState = {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
}));
