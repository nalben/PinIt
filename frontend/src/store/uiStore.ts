import { create } from 'zustand';

type HeaderDropdown = 'profile' | 'notifications' | null;
export type FriendsModalView = 'list' | 'search';

interface UIState {
  headerDropdown: HeaderDropdown;
  authModalOpen: boolean;
  friendsModalOpen: boolean;
  friendsModalView: FriendsModalView;
  isBoardMenuOpen: boolean;

  // dropdown actions
  openHeaderDropdown: (dropdown: HeaderDropdown) => void;
  closeHeaderDropdown: () => void;
  toggleHeaderDropdown: (dropdown: HeaderDropdown) => void;

  // modal actions
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openFriendsModal: (view?: FriendsModalView) => void;
  closeFriendsModal: () => void;
  setFriendsModalView: (view: FriendsModalView) => void;
  openBoardMenu: () => void;
  closeBoardMenu: () => void;
  toggleBoardMenu: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  headerDropdown: null,
  authModalOpen: false,
  friendsModalOpen: false,
  friendsModalView: 'list',
  isBoardMenuOpen: true,

  openHeaderDropdown: (dropdown) => set({ headerDropdown: dropdown }),
  closeHeaderDropdown: () => set({ headerDropdown: null }),
  toggleHeaderDropdown: (dropdown) =>
    set((s) => ({
      headerDropdown: s.headerDropdown === dropdown ? null : dropdown,
    })),

  openAuthModal: () => set({ authModalOpen: true }),
  closeAuthModal: () => set({ authModalOpen: false }),

  openFriendsModal: (view = 'list') =>
    set({ friendsModalOpen: true, friendsModalView: view }),
  closeFriendsModal: () => set({ friendsModalOpen: false }),
  setFriendsModalView: (view) => set({ friendsModalView: view }),

  openBoardMenu: () => set({ isBoardMenuOpen: true }),
  closeBoardMenu: () => set({ isBoardMenuOpen: false }),
  toggleBoardMenu: () =>
    set((s) => ({
      isBoardMenuOpen: !s.isBoardMenuOpen,
    })),
}));
