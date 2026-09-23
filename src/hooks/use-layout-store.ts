"use client";

import { create } from "zustand";

type LayoutState = {
  menuOpen: boolean;
  sidebarCompact: boolean;
  setMenuOpen: (open: boolean) => void;
  setSidebarCompact: (compact: boolean) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  menuOpen: false,
  sidebarCompact: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setSidebarCompact: (sidebarCompact) => set({ sidebarCompact }),
}));
