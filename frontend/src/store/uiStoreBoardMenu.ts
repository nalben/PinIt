export type BoardMenuTransitionView = 'board' | 'link' | 'card' | 'draw';

export type BoardMenuTransitionState = {
  isBoardMenuOpen: boolean;
  boardMenuView: BoardMenuTransitionView;
  linkInspectorPrevMenuOpen: boolean | null;
  cardDetailsPrevMenuOpen: boolean | null;
  flowCardSettingsOpen: boolean;
  restoreBoardMenuAfterFlowCardSettings: boolean;
};

type BoardMenuResetState = {
  boardMenuView: 'board';
  selectedLink: null;
  selectedLinkDraft: null;
  selectedCardDetails: null;
  linkInspectorPrevMenuOpen: null;
  cardDetailsPrevMenuOpen: null;
};

type LinkInspectorResetState = {
  boardMenuView: 'board';
  selectedLink: null;
  selectedLinkDraft: null;
  linkInspectorPrevMenuOpen: null;
};

type CardDetailsResetState = {
  boardMenuView: 'board';
  selectedCardDetails: null;
  cardDetailsPrevMenuOpen: null;
};

export const resolveBoardMenuPrevOpenState = (state: BoardMenuTransitionState) => {
  if (state.flowCardSettingsOpen) return state.restoreBoardMenuAfterFlowCardSettings;
  if (state.boardMenuView === 'link') return state.linkInspectorPrevMenuOpen ?? state.isBoardMenuOpen;
  if (state.boardMenuView === 'card') return state.cardDetailsPrevMenuOpen ?? state.isBoardMenuOpen;
  return state.isBoardMenuOpen;
};

export const shouldKeepBoardMenuOpenOnInspectorClose = (
  state: BoardMenuTransitionState,
  prevOpen: boolean | null
) => {
  if (prevOpen === true) return true;
  if (prevOpen === false) return false;
  if (state.flowCardSettingsOpen) return state.restoreBoardMenuAfterFlowCardSettings;
  return false;
};

export const buildBoardMenuResetState = (): BoardMenuResetState => ({
  boardMenuView: 'board' as const,
  selectedLink: null,
  selectedLinkDraft: null,
  selectedCardDetails: null,
  linkInspectorPrevMenuOpen: null,
  cardDetailsPrevMenuOpen: null,
});

export const buildLinkInspectorResetState = (): LinkInspectorResetState => ({
  boardMenuView: 'board' as const,
  selectedLink: null,
  selectedLinkDraft: null,
  linkInspectorPrevMenuOpen: null,
});

export const buildCardDetailsResetState = (): CardDetailsResetState => ({
  boardMenuView: 'board' as const,
  selectedCardDetails: null,
  cardDetailsPrevMenuOpen: null,
});
