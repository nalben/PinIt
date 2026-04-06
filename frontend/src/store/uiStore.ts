import { create } from 'zustand';
import {
  buildBoardMenuResetState,
  buildCardDetailsResetState,
  buildLinkInspectorResetState,
  resolveBoardMenuPrevOpenState,
  shouldKeepBoardMenuOpenOnInspectorClose,
} from './uiStoreBoardMenu';

type HeaderDropdown = 'profile' | 'notifications' | null;
export type FriendsModalView = 'list' | 'search';
export type BoardSettingsModalView = 'settings' | 'participants';
export type BoardSettingsParticipantsInnerView = 'friends' | 'guests';
export type FlowCardShape = 'rectangle' | 'rhombus' | 'circle';
export type FlowLinkStyle = 'line' | 'arrow';
export type BoardMenuView = 'board' | 'link' | 'card';
export type SelectedLinkSnapshot = {
  linkId: number;
  boardId: number;
  fromCardId: number;
  toCardId: number;
  style: FlowLinkStyle;
  color: string;
  label: string | null;
  isLabelVisible: boolean;
  fromTitle?: string | null;
  toTitle?: string | null;
};
export type SelectedCardDetailsSnapshot = {
  cardId: number;
  boardId: number;
  title: string;
};

export type SelectedLinkDraft = {
  fromCardId: number;
  toCardId: number;
  style: FlowLinkStyle;
  label: string;
  isLabelVisible: boolean;
  fromTitle?: string | null;
  toTitle?: string | null;
};

type EscapeHandler = {
  priority: number;
  isOpen: () => boolean;
  onEscape: () => void;
};

type RegisteredEscapeHandler = EscapeHandler & { order: number };

const escapeHandlers = new Map<string, RegisteredEscapeHandler>();
let escapeOrder = 0;
const BOARD_MENU_CLOSE_DELAY = 520;
let boardMenuCloseTimeout: number | null = null;
export const BOARD_MENU_AUTO_OPEN_MIN_WIDTH = 1440;
export const BOARD_MENU_WIDE_MIN_WIDTH = 1700;
const isWideBoardMenu = () => typeof window !== 'undefined' && window.innerWidth >= BOARD_MENU_WIDE_MIN_WIDTH;

export type FlowCardSettingsSnapshot = {
  nodeId: string;
  type: FlowCardShape;
  title: string;
  isLocked: boolean;
  imageSrc: string | null;
  color: string | null;
};

interface UIState {
  headerDropdown: HeaderDropdown;
  authModalOpen: boolean;
  friendsModalOpen: boolean;
  friendsModalView: FriendsModalView;
  isBoardMenuOpen: boolean;
  boardMenuView: BoardMenuView;
  selectedLink: SelectedLinkSnapshot | null;
  selectedLinkDraft: SelectedLinkDraft | null;
  selectedCardDetails: SelectedCardDetailsSnapshot | null;
  linkInspectorPrevMenuOpen: boolean | null;
  cardDetailsPrevMenuOpen: boolean | null;
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
  openLinkInspector: (snapshot: SelectedLinkSnapshot) => void;
  closeLinkInspector: () => void;
  patchSelectedLinkDraft: (patch: Partial<SelectedLinkDraft>) => void;
  openCardDetails: (snapshot: SelectedCardDetailsSnapshot, options?: { openMenu?: boolean }) => void;
  closeCardDetails: () => void;
  openCardDetailsFromNode: (snapshot: SelectedCardDetailsSnapshot, options?: { openMenu?: boolean }) => void;
  patchSelectedCardDetails: (patch: Partial<SelectedCardDetailsSnapshot>) => void;
  openFlowCardSettingsFromNode: (snapshot: FlowCardSettingsSnapshot) => void;
  handleBoardMenuBlur: () => void;
  openBoardSettingsModal: (view?: BoardSettingsModalView) => void;
  closeBoardSettingsModal: () => void;
  setBoardSettingsModalView: (view: BoardSettingsModalView) => void;
  setBoardSettingsModalParticipantsInnerViewNext: (view: BoardSettingsParticipantsInnerView | null) => void;

  openFlowCardSettings: (snapshot: FlowCardSettingsSnapshot, options?: { restoreBoardMenu?: boolean; keepBoardMenuOpen?: boolean }) => void;
  closeFlowCardSettings: () => void;
  setFlowCardSettingsDraft: (next: Partial<Omit<FlowCardSettingsSnapshot, 'nodeId'>>) => void;
  commitFlowCardSettingsDraft: () => void;

  showTopAlarm: (message: string) => void;

  registerEscapeHandler: (id: string, handler: EscapeHandler) => void;
  unregisterEscapeHandler: (id: string) => void;
  triggerEscape: () => boolean;
}

export const useUIStore = create<UIState>((set, get) => {
  let topAlarmHideTimeout: number | null = null;
  let topAlarmUnmountTimeout: number | null = null;

  const clearTopAlarmTimers = () => {
    if (topAlarmHideTimeout) window.clearTimeout(topAlarmHideTimeout);
    if (topAlarmUnmountTimeout) window.clearTimeout(topAlarmUnmountTimeout);
    topAlarmHideTimeout = null;
    topAlarmUnmountTimeout = null;
  };

  const clearBoardMenuCloseTimer = () => {
    if (boardMenuCloseTimeout) window.clearTimeout(boardMenuCloseTimeout);
    boardMenuCloseTimeout = null;
  };

  const buildBoardMenuCloseResult = (
    s: UIState,
    options: {
      shouldKeepOpen: boolean;
      resetState: () => Partial<UIState>;
    }
  ): Partial<UIState> => {
    if (options.shouldKeepOpen) {
      clearBoardMenuCloseTimer();
      return {
        ...options.resetState(),
        isBoardMenuOpen: true,
      };
    }

    if (!s.isBoardMenuOpen) {
      clearBoardMenuCloseTimer();
      return {
        ...options.resetState(),
        isBoardMenuOpen: false,
      };
    }

    scheduleBoardMenuViewReset(() => {
      set({
        ...options.resetState(),
      });
    });

    return {
      isBoardMenuOpen: false,
    };
  };

  const scheduleBoardMenuViewReset = (next: () => void) => {
    clearBoardMenuCloseTimer();
    boardMenuCloseTimeout = window.setTimeout(() => {
      next();
      boardMenuCloseTimeout = null;
    }, BOARD_MENU_CLOSE_DELAY);
  };

  return ({
  headerDropdown: null,
  authModalOpen: false,
  friendsModalOpen: false,
  friendsModalView: 'list',
  isBoardMenuOpen: false,
  boardMenuView: 'board',
  selectedLink: null,
  selectedLinkDraft: null,
  selectedCardDetails: null,
  linkInspectorPrevMenuOpen: null,
  cardDetailsPrevMenuOpen: null,
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

  openBoardMenu: () => {
    clearBoardMenuCloseTimer();
    set({ isBoardMenuOpen: true });
  },
  closeBoardMenu: () =>
    set((s) => {
      if (!s.isBoardMenuOpen) {
        clearBoardMenuCloseTimer();
        return {
          isBoardMenuOpen: false,
          boardMenuView: s.boardMenuView === 'link' || s.boardMenuView === 'card' ? 'board' : s.boardMenuView,
          selectedLink: s.boardMenuView === 'link' ? null : s.selectedLink,
          selectedLinkDraft: s.boardMenuView === 'link' ? null : s.selectedLinkDraft,
          selectedCardDetails: s.boardMenuView === 'card' ? null : s.selectedCardDetails,
          linkInspectorPrevMenuOpen: s.boardMenuView === 'link' ? null : s.linkInspectorPrevMenuOpen,
          cardDetailsPrevMenuOpen: s.boardMenuView === 'card' ? null : s.cardDetailsPrevMenuOpen,
        };
      }

      if (s.boardMenuView === 'link' || s.boardMenuView === 'card') {
        scheduleBoardMenuViewReset(() => {
          set({
            ...buildBoardMenuResetState(),
          });
        });
      } else {
        clearBoardMenuCloseTimer();
      }

      return { isBoardMenuOpen: false };
    }),
  toggleBoardMenu: () =>
    set((s) => {
      const nextOpen = !s.isBoardMenuOpen;
      if (!nextOpen) {
        if (s.boardMenuView === 'link' || s.boardMenuView === 'card') {
          scheduleBoardMenuViewReset(() => {
            set({
              ...buildBoardMenuResetState(),
            });
          });
        } else {
          clearBoardMenuCloseTimer();
        }

        return { isBoardMenuOpen: false };
      }

      clearBoardMenuCloseTimer();
      return { isBoardMenuOpen: true };
    }),

  openLinkInspector: (snapshot) =>
    set((s) => {
      clearBoardMenuCloseTimer();
      return ({
      isBoardMenuOpen: true,
      boardMenuView: 'link',
      selectedLink: snapshot,
      selectedLinkDraft: {
        fromCardId: snapshot.fromCardId,
        toCardId: snapshot.toCardId,
        style: snapshot.style,
        label: snapshot.label ?? '',
        isLabelVisible: Boolean(snapshot.isLabelVisible),
        fromTitle: snapshot.fromTitle ?? null,
        toTitle: snapshot.toTitle ?? null,
      },
      selectedCardDetails: null,
      linkInspectorPrevMenuOpen:
        s.boardMenuView === 'link'
          ? (s.linkInspectorPrevMenuOpen ?? s.isBoardMenuOpen)
          : resolveBoardMenuPrevOpenState(s),
      cardDetailsPrevMenuOpen: null,
      });
    }),
  closeLinkInspector: () =>
    set((s) => {
      return buildBoardMenuCloseResult(s, {
        shouldKeepOpen: shouldKeepBoardMenuOpenOnInspectorClose(s, s.linkInspectorPrevMenuOpen),
        resetState: () => buildLinkInspectorResetState(),
      });
    }),
  patchSelectedLinkDraft: (patch) =>
    set((s) => (s.selectedLinkDraft ? { selectedLinkDraft: { ...s.selectedLinkDraft, ...patch } } : {})),

  openCardDetails: (snapshot, options) =>
    set((s) => {
      clearBoardMenuCloseTimer();
      return ({
      isBoardMenuOpen: options?.openMenu === false ? s.isBoardMenuOpen : true,
      boardMenuView: 'card',
      selectedCardDetails: snapshot,
      selectedLink: null,
      selectedLinkDraft: null,
      linkInspectorPrevMenuOpen: null,
      cardDetailsPrevMenuOpen:
        s.boardMenuView === 'card'
          ? (s.cardDetailsPrevMenuOpen ?? s.isBoardMenuOpen)
          : resolveBoardMenuPrevOpenState(s),
      });
    }),
  closeCardDetails: () =>
    set((s) => {
      return buildBoardMenuCloseResult(s, {
        shouldKeepOpen: shouldKeepBoardMenuOpenOnInspectorClose(s, s.cardDetailsPrevMenuOpen),
        resetState: () => buildCardDetailsResetState(),
      });
    }),
  openCardDetailsFromNode: (snapshot, options) => {
    if (!isWideBoardMenu() && !options?.openMenu) {
      clearBoardMenuCloseTimer();
      set(() => ({
        boardMenuView: 'board',
        selectedCardDetails: snapshot,
        selectedLink: null,
        selectedLinkDraft: null,
        linkInspectorPrevMenuOpen: null,
        cardDetailsPrevMenuOpen: null,
      }));
      return;
    }
    get().openCardDetails(snapshot, { openMenu: true });
  },
  patchSelectedCardDetails: (patch) =>
    set((s) => (s.selectedCardDetails ? { selectedCardDetails: { ...s.selectedCardDetails, ...patch } } : {})),
  openFlowCardSettingsFromNode: (snapshot) => {
    const wide = isWideBoardMenu();
    get().openFlowCardSettings(snapshot, { keepBoardMenuOpen: wide });
  },
  handleBoardMenuBlur: () => {
    const view = get().boardMenuView;
    if (view === 'link') get().closeLinkInspector();
    if (view === 'card') get().closeCardDetails();
  },

  openBoardSettingsModal: (view = 'settings') => set({ boardSettingsModalOpen: true, boardSettingsModalView: view }),
  closeBoardSettingsModal: () => set({ boardSettingsModalOpen: false, boardSettingsModalView: 'settings' }),
  setBoardSettingsModalView: (view) => set({ boardSettingsModalView: view }),
  setBoardSettingsModalParticipantsInnerViewNext: (view) => set({ boardSettingsModalParticipantsInnerViewNext: view }),

  openFlowCardSettings: (snapshot, options) =>
    set((s) => {
      clearBoardMenuCloseTimer();
      return ({
        flowCardSettingsOpen: true,
        flowCardSettings: snapshot,
        flowCardSettingsDraft: {
          type: snapshot.type,
          title: snapshot.title,
          isLocked: snapshot.isLocked,
          imageSrc: snapshot.imageSrc,
          color: snapshot.color,
        },
        restoreBoardMenuAfterFlowCardSettings:
          s.flowCardSettingsOpen
            ? s.restoreBoardMenuAfterFlowCardSettings
            : options?.restoreBoardMenu === false
              ? false
              : resolveBoardMenuPrevOpenState(s),
        isBoardMenuOpen: options?.keepBoardMenuOpen ? s.isBoardMenuOpen : false,
        boardMenuView: 'board',
        selectedLink: null,
        selectedLinkDraft: null,
        selectedCardDetails: null,
        linkInspectorPrevMenuOpen: null,
        cardDetailsPrevMenuOpen: null,
      });
    }),
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
      }, 4000);
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
