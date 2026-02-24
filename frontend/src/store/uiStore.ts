import { create } from 'zustand';

type HeaderDropdown = 'profile' | 'notifications' | null;
export type FriendsModalView = 'list' | 'search';
export type BoardSettingsModalView = 'settings' | 'participants';
export type BoardSettingsParticipantsInnerView = 'friends' | 'guests';

interface UIState {
  headerDropdown: HeaderDropdown;
  authModalOpen: boolean;
  friendsModalOpen: boolean;
  friendsModalView: FriendsModalView;
  isBoardMenuOpen: boolean;
  boardSettingsModalOpen: boolean;
  boardSettingsModalView: BoardSettingsModalView;
  boardSettingsModalParticipantsInnerViewNext: BoardSettingsParticipantsInnerView | null;

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
  openBoardSettingsModal: (view?: BoardSettingsModalView) => void;
  closeBoardSettingsModal: () => void;
  setBoardSettingsModalView: (view: BoardSettingsModalView) => void;
  setBoardSettingsModalParticipantsInnerViewNext: (view: BoardSettingsParticipantsInnerView | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  headerDropdown: null,
  authModalOpen: false,
  friendsModalOpen: false,
  friendsModalView: 'list',
  isBoardMenuOpen: true,
  boardSettingsModalOpen: false,
  boardSettingsModalView: 'settings',
  boardSettingsModalParticipantsInnerViewNext: null,

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

  openBoardSettingsModal: (view = 'settings') => set({ boardSettingsModalOpen: true, boardSettingsModalView: view }),
  closeBoardSettingsModal: () => set({ boardSettingsModalOpen: false, boardSettingsModalView: 'settings' }),
  setBoardSettingsModalView: (view) => set({ boardSettingsModalView: view }),
  setBoardSettingsModalParticipantsInnerViewNext: (view) => set({ boardSettingsModalParticipantsInnerViewNext: view }),
}));
