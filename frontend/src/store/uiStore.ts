import { create } from 'zustand';

type HeaderDropdown = 'profile' | 'notifications' | null;
export type FriendsModalView = 'list' | 'search';
export type BoardSettingsModalView = 'settings' | 'participants';
export type BoardSettingsParticipantsInnerView = 'friends' | 'guests';
export type FlowCardShape = 'rectangle' | 'rhombus' | 'circle';

type EscapeHandler = {
  priority: number;
  isOpen: () => boolean;
  onEscape: () => void;
};

type RegisteredEscapeHandler = EscapeHandler & { order: number };

const escapeHandlers = new Map<string, RegisteredEscapeHandler>();
let escapeOrder = 0;

export type FlowCardSettingsSnapshot = {
  nodeId: string;
  type: FlowCardShape;
  title: string;
  isLocked: boolean;
  imageSrc: string | null;
};

interface UIState {
  headerDropdown: HeaderDropdown;
  authModalOpen: boolean;
  friendsModalOpen: boolean;
  friendsModalView: FriendsModalView;
  isBoardMenuOpen: boolean;
  restoreBoardMenuAfterFlowCardSettings: boolean;
  boardSettingsModalOpen: boolean;
  boardSettingsModalView: BoardSettingsModalView;
  boardSettingsModalParticipantsInnerViewNext: BoardSettingsParticipantsInnerView | null;
  flowCardSettingsOpen: boolean;
  flowCardSettings: FlowCardSettingsSnapshot | null;
  flowCardSettingsDraft: Omit<FlowCardSettingsSnapshot, 'nodeId'> | null;
  topAlarm: { message: string; open: boolean } | null;

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

  openFlowCardSettings: (snapshot: FlowCardSettingsSnapshot) => void;
  closeFlowCardSettings: () => void;
  setFlowCardSettingsDraft: (next: Partial<Omit<FlowCardSettingsSnapshot, 'nodeId'>>) => void;
  commitFlowCardSettingsDraft: () => void;

  showTopAlarm: (message: string) => void;

  registerEscapeHandler: (id: string, handler: EscapeHandler) => void;
  unregisterEscapeHandler: (id: string) => void;
  triggerEscape: () => boolean;
}

export const useUIStore = create<UIState>((set) => {
  let topAlarmHideTimeout: number | null = null;
  let topAlarmUnmountTimeout: number | null = null;

  const clearTopAlarmTimers = () => {
    if (topAlarmHideTimeout) window.clearTimeout(topAlarmHideTimeout);
    if (topAlarmUnmountTimeout) window.clearTimeout(topAlarmUnmountTimeout);
    topAlarmHideTimeout = null;
    topAlarmUnmountTimeout = null;
  };

  return ({
  headerDropdown: null,
  authModalOpen: false,
  friendsModalOpen: false,
  friendsModalView: 'list',
  isBoardMenuOpen: true,
  restoreBoardMenuAfterFlowCardSettings: false,
  boardSettingsModalOpen: false,
  boardSettingsModalView: 'settings',
  boardSettingsModalParticipantsInnerViewNext: null,
  flowCardSettingsOpen: false,
  flowCardSettings: null,
  flowCardSettingsDraft: null,
  topAlarm: null,

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

  openFlowCardSettings: (snapshot) =>
    set((s) => ({
      flowCardSettingsOpen: true,
      flowCardSettings: snapshot,
      flowCardSettingsDraft: {
        type: snapshot.type,
        title: snapshot.title,
        isLocked: snapshot.isLocked,
        imageSrc: snapshot.imageSrc,
      },
      restoreBoardMenuAfterFlowCardSettings: s.flowCardSettingsOpen ? s.restoreBoardMenuAfterFlowCardSettings : s.isBoardMenuOpen,
      isBoardMenuOpen: false,
    })),
  closeFlowCardSettings: () =>
    set((s) => ({
      flowCardSettingsOpen: false,
      flowCardSettings: null,
      flowCardSettingsDraft: null,
      isBoardMenuOpen: s.restoreBoardMenuAfterFlowCardSettings ? true : s.isBoardMenuOpen,
      restoreBoardMenuAfterFlowCardSettings: false,
    })),
  setFlowCardSettingsDraft: (next) =>
    set((s) => (s.flowCardSettingsDraft ? { flowCardSettingsDraft: { ...s.flowCardSettingsDraft, ...next } } : {})),
  commitFlowCardSettingsDraft: () =>
    set((s) => {
      if (!s.flowCardSettings || !s.flowCardSettingsDraft) return {};
      return {
        flowCardSettings: { ...s.flowCardSettings, ...s.flowCardSettingsDraft },
      };
    }),

  showTopAlarm: (message) => {
    clearTopAlarmTimers();
    set({ topAlarm: { message, open: true } });

    topAlarmHideTimeout = window.setTimeout(() => {
      set((s) => (s.topAlarm ? { topAlarm: { ...s.topAlarm, open: false } } : {}));
      topAlarmHideTimeout = null;
      topAlarmUnmountTimeout = window.setTimeout(() => {
        set({ topAlarm: null });
        topAlarmUnmountTimeout = null;
      }, 220);
      }, 2200);
  },

  registerEscapeHandler: (id, handler) => {
    escapeOrder += 1;
    escapeHandlers.set(id, { ...handler, order: escapeOrder });
  },
  unregisterEscapeHandler: (id) => {
    escapeHandlers.delete(id);
  },
  triggerEscape: () => {
    const handlers = Array.from(escapeHandlers.values()).sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.order - a.order;
    });

    for (const h of handlers) {
      if (!h.isOpen()) continue;
      h.onEscape();
      return true;
    }

    return false;
  },
  });
});
