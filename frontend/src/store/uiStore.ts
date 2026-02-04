import { create } from 'zustand';

type HeaderDropdown = 'profile' | 'notifications' | null;

interface UIState {
  headerDropdown: HeaderDropdown;
  authModalOpen: boolean;

  // dropdown actions
  openHeaderDropdown: (dropdown: HeaderDropdown) => void;
  closeHeaderDropdown: () => void;
  toggleHeaderDropdown: (dropdown: HeaderDropdown) => void;

  // modal actions
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  headerDropdown: null,
  authModalOpen: false,

  openHeaderDropdown: (dropdown) => set({ headerDropdown: dropdown }),
  closeHeaderDropdown: () => set({ headerDropdown: null }),
  toggleHeaderDropdown: (dropdown) =>
    set((s) => ({
      headerDropdown: s.headerDropdown === dropdown ? null : dropdown,
    })),

  openAuthModal: () => set({ authModalOpen: true }),
  closeAuthModal: () => set({ authModalOpen: false }),
}));
