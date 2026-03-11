import React from 'react';
import { Link } from 'react-router-dom';
import classes from './Board.module.scss';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import AuthTrigger from '@/components/auth/AuthTrigger';
import type {
  BoardMenuView,
  SelectedCardDetailsSnapshot,
  SelectedLinkDraft,
  SelectedLinkSnapshot,
} from '@/store/uiStore';
import type { BoardParticipant } from '@/store/boardDetailsStore';
import { resolveAvatarSrc } from '@/components/flowboard/utils/avatar';
import Close from '@/assets/icons/monochrome/back.svg';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import DefaultUser from '@/assets/icons/monochrome/default-user.svg';
import Deny from '@/assets/icons/monochrome/deny.svg';
import Members from '@/assets/icons/monochrome/members.svg';
import SwitchIcon from '@/assets/icons/monochrome/switch.svg';
import Plus from '@/assets/icons/monochrome/plus.svg';
import LinkIcon from '@/assets/icons/monochrome/link.svg';
import { BoardRightMenuCardDetails } from './BoardRightMenuCardDetails';

type BoardInfoViewModel = {
  title: string | null;
  description: string | null;
  imageSrc: string | null;
  imageState: 'some' | 'none' | 'unknown';
};

type BoardRightMenuProps = {
  boardInfo: BoardInfoViewModel | null;
  boardMenuRef: React.RefObject<HTMLDivElement | null>;
  boardMenuView: BoardMenuView;
  canEditCards: boolean;
  canManageParticipants: boolean;
  closeCardDetails: () => void;
  closeLinkInspector: () => void;
  deleteSelectedLink: () => void | Promise<void>;
  effectiveBoardMenuOpen: boolean;
  failedBoardImageSrc: string | null;
  failedParticipantAvatarSrcs: Record<string, true>;
  flipSelectedLinkDirection: () => void | Promise<void>;
  guests: BoardParticipant[];
  isBoardMetaLoading: boolean;
  isInitialized: boolean;
  isLoggedIn: boolean;
  isOwner: boolean;
  isOwnerBoard: boolean;
  isGuestBoard: boolean;
  leaveBoard: () => void | Promise<void>;
  leaveConfirmOpen: boolean;
  leaveLoading: boolean;
  linkDeleteConfirmOpen: boolean;
  linkDeleteLoading: boolean;
  linkStyleDropdownOpen: boolean;
  loadedBoardImageSrc: string | null;
  loadedParticipantAvatarSrcs: Record<string, true>;
  onCreateNode: () => void;
  onOpenBoardSettings: () => void;
  onOpenParticipantsSettings: (view: 'friends' | 'guests') => void;
  onStartLinkMode: () => void;
  onToggleBoardMenu: () => void;
  ownerAvatarSrc: string | null;
  ownerParticipant: BoardParticipant | null;
  participantsInitialLoading: boolean;
  patchSelectedLinkDraft: (patch: Partial<SelectedLinkDraft>) => void;
  removeConfirmParticipantId: number | null;
  removeLoadingParticipantId: number | null;
  removeParticipant: (participantId: number) => void | Promise<void>;
  roleDropdownParticipantId: number | null;
  roleLoadingParticipantId: number | null;
  saveSelectedLink: () => void | Promise<void>;
  selectedCardDetails: SelectedCardDetailsSnapshot | null;
  selectedLink: SelectedLinkSnapshot | null;
  selectedLinkDraft: SelectedLinkDraft | null;
  setFailedParticipantAvatarSrcs: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  setLeaveConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLinkDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLinkStyleDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadedParticipantAvatarSrcs: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  setRemoveConfirmParticipantId: React.Dispatch<React.SetStateAction<number | null>>;
  setRoleDropdownParticipantId: React.Dispatch<React.SetStateAction<number | null>>;
  shouldShowOwnerActions: boolean;
  shouldShowParticipants: boolean;
  updateParticipantRole: (participantId: number, nextRole: 'guest' | 'editer') => void | Promise<void>;
};

export const BoardRightMenu = (props: BoardRightMenuProps) => {
  const {
    boardInfo,
    boardMenuRef,
    boardMenuView,
    canEditCards,
    canManageParticipants,
    closeCardDetails,
    closeLinkInspector,
    deleteSelectedLink,
    effectiveBoardMenuOpen,
    failedBoardImageSrc,
    failedParticipantAvatarSrcs,
    flipSelectedLinkDirection,
    guests,
    isBoardMetaLoading,
    isInitialized,
    isLoggedIn,
    isOwner,
    isOwnerBoard,
    isGuestBoard,
    leaveBoard,
    leaveConfirmOpen,
    leaveLoading,
    linkDeleteConfirmOpen,
    linkDeleteLoading,
    linkStyleDropdownOpen,
    loadedBoardImageSrc,
    loadedParticipantAvatarSrcs,
    onCreateNode,
    onOpenBoardSettings,
    onOpenParticipantsSettings,
    onStartLinkMode,
    onToggleBoardMenu,
    ownerAvatarSrc,
    ownerParticipant,
    participantsInitialLoading,
    patchSelectedLinkDraft,
    removeConfirmParticipantId,
    removeLoadingParticipantId,
    removeParticipant,
    roleDropdownParticipantId,
    roleLoadingParticipantId,
    saveSelectedLink,
    selectedCardDetails,
    selectedLink,
    selectedLinkDraft,
    setFailedParticipantAvatarSrcs,
    setLeaveConfirmOpen,
    setLinkDeleteConfirmOpen,
    setLinkStyleDropdownOpen,
    setLoadedParticipantAvatarSrcs,
    setRemoveConfirmParticipantId,
    setRoleDropdownParticipantId,
    shouldShowOwnerActions,
    shouldShowParticipants,
    updateParticipantRole,
  } = props;

  return (
    <div ref={boardMenuRef} className={`${classes.board_menu_con} ${!effectiveBoardMenuOpen ? classes.menu_close : ''}`}>
      <div className={classes.left_menu_btns}>
        <button
          className={`${classes.left_menu_btn} ${classes.left_menu_btn_toggle}`.trim()}
          onClick={(e) => {
            onToggleBoardMenu();
            e.currentTarget.blur();
          }}
          type="button"
        >
          <Close />
        </button>
        {canEditCards ? (
          <button className={`${classes.left_menu_btn} ${classes.left_menu_btn_create_node}`.trim()} type="button" onClick={onCreateNode}>
            <Plus />
          </button>
        ) : null}
        {canEditCards ? (
          <button
            className={`${classes.left_menu_btn} ${classes.left_menu_btn_create_node}`.trim()}
            type="button"
            onClick={(e) => {
              onStartLinkMode();
              e.currentTarget.blur();
            }}
            aria-label="Связать записи"
          >
            <LinkIcon />
          </button>
        ) : null}
      </div>
      <div className={`${classes.board_menu_} ${boardMenuView === 'card' ? classes.board_menu_details : ''}`.trim()}>
        {boardMenuView === 'link' && selectedLink && canEditCards ? (
          <div className={classes.link_inspector_root}>
            <div className={classes.link_inspector_header}>
              <div className={classes.link_inspector_title}>Связь</div>
            </div>
            <div className={classes.link_inspector_meta}>
              <div>
                <span>От:</span> {selectedLinkDraft?.fromTitle || selectedLink.fromTitle || `#${selectedLinkDraft?.fromCardId ?? selectedLink.fromCardId}`}
              </div>
              <div>
                <span>К:</span> {selectedLinkDraft?.toTitle || selectedLink.toTitle || `#${selectedLinkDraft?.toCardId ?? selectedLink.toCardId}`}
              </div>
            </div>
            <div className={classes.link_inspector_form}>
              <div className={classes.link_inspector_field}>
                <div className={classes.link_inspector_label}>Вид</div>
                <div className={classes.link_inspector_select_row}>
                  <div className={classes.link_inspector_select_wrap}>
                    {__PLATFORM__ === 'desktop' ? (
                      <DropdownWrapper
                        left
                        menuClassName={classes.link_inspector_style_dropdown}
                        isOpen={linkStyleDropdownOpen}
                        onClose={() => setLinkStyleDropdownOpen(false)}
                      >
                        {[
                          <button
                            key="trigger"
                            type="button"
                            className={classes.link_inspector_select_trigger}
                            onClick={() => setLinkStyleDropdownOpen((prev) => !prev)}
                            disabled={!canEditCards || !isLoggedIn}
                          >
                            {(selectedLinkDraft?.style ?? selectedLink.style) === 'arrow' ? 'Стрелка' : 'Линия'}
                          </button>,
                          <div key="menu" className={classes.link_inspector_select_menu}>
                            <button
                              type="button"
                              data-dropdown-class={`${classes.link_inspector_select_item} ${(selectedLinkDraft?.style ?? selectedLink.style) === 'line' ? classes.link_inspector_select_item_active : ''}`.trim()}
                              onClick={() => patchSelectedLinkDraft({ style: 'line' })}
                              disabled={!canEditCards || !isLoggedIn}
                            >
                              Линия
                            </button>
                            <button
                              type="button"
                              data-dropdown-class={`${classes.link_inspector_select_item} ${(selectedLinkDraft?.style ?? selectedLink.style) === 'arrow' ? classes.link_inspector_select_item_active : ''}`.trim()}
                              onClick={() => patchSelectedLinkDraft({ style: 'arrow' })}
                              disabled={!canEditCards || !isLoggedIn}
                            >
                              Стрелка
                            </button>
                          </div>,
                        ]}
                      </DropdownWrapper>
                    ) : (
                      <select
                        value={selectedLinkDraft?.style ?? selectedLink.style}
                        onChange={(e) => patchSelectedLinkDraft({ style: e.currentTarget.value === 'arrow' ? 'arrow' : 'line' })}
                        disabled={!canEditCards || !isLoggedIn}
                      >
                        <option value="line">Линия</option>
                        <option value="arrow">Стрелка</option>
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    className={classes.link_inspector_flip_btn}
                    onClick={(e) => {
                      void flipSelectedLinkDirection();
                      e.currentTarget.blur();
                    }}
                    disabled={!canEditCards || !isLoggedIn}
                    aria-label="Развернуть связь"
                  >
                    <SwitchIcon />
                  </button>
                </div>
              </div>
              <div className={classes.link_inspector_field}>
                <div className={classes.link_inspector_label}>Подпись</div>
                <input
                  value={selectedLinkDraft?.label ?? (selectedLink.label ?? '')}
                  placeholder="Введите подпись"
                  maxLength={70}
                  onChange={(e) => patchSelectedLinkDraft({ label: e.currentTarget.value })}
                  disabled={!canEditCards || !isLoggedIn}
                />
              </div>
              <label className={classes.link_inspector_toggle}>
                <span className={classes.link_inspector_toggle_text}>Показывать подпись</span>
                <input
                  className={classes.link_inspector_toggle_input}
                  type="checkbox"
                  checked={Boolean(selectedLinkDraft?.isLabelVisible ?? selectedLink.isLabelVisible)}
                  onChange={(e) => patchSelectedLinkDraft({ isLabelVisible: e.currentTarget.checked })}
                  disabled={!canEditCards || !isLoggedIn}
                />
                <span className={classes.link_inspector_toggle_switch} aria-hidden="true" />
              </label>
              <div className={classes.link_inspector_delete_row}>
                <DropdownWrapper upDel closeOnClick={false} isOpen={linkDeleteConfirmOpen} onClose={() => setLinkDeleteConfirmOpen(false)}>
                  {[
                    <button
                      key="trigger"
                      type="button"
                      className={classes.link_inspector_delete_trigger}
                      onClick={() => setLinkDeleteConfirmOpen((prev) => !prev)}
                      disabled={!canEditCards || !isLoggedIn || linkDeleteLoading}
                      aria-label="Удалить связь"
                    >
                      Удалить связь
                    </button>,
                    <div key="menu">
                      <button
                        type="button"
                        data-dropdown-class={classes.participant_confirm_danger}
                        onClick={() => void deleteSelectedLink()}
                        disabled={!canEditCards || !isLoggedIn || linkDeleteLoading}
                      >
                        {'Да, удалить'}
                      </button>
                      <button
                        type="button"
                        data-dropdown-class={classes.participant_confirm_cancel}
                        onClick={() => setLinkDeleteConfirmOpen(false)}
                        disabled={linkDeleteLoading}
                      >
                        Отмена
                      </button>
                    </div>,
                  ]}
                </DropdownWrapper>
              </div>
              <div className={classes.link_inspector_actions}>
                <Mainbtn variant="mini" kind="button" type="button" text="Сохранить" onClick={() => void saveSelectedLink()} disabled={!canEditCards || !isLoggedIn || !selectedLinkDraft} />
                <Mainbtn variant="mini" kind="button" type="button" text="Назад" onClick={() => closeLinkInspector()} />
              </div>
            </div>
          </div>
        ) : boardMenuView === 'card' && selectedCardDetails ? (
          <div className={classes.link_inspector_root}>
            <BoardRightMenuCardDetails canEditCards={canEditCards} isLoggedIn={isLoggedIn} selectedCardDetails={selectedCardDetails} />
          </div>
        ) : (
          <div className={classes.board_info}>
            {isBoardMetaLoading || !boardInfo?.title ? (
              <>
                <div className={`${classes.skeleton} ${classes.board_info_img_skeleton}`} />
                <div className={`${classes.skeleton} ${classes.board_info_line_skeleton}`} />
                <div className={`${classes.skeleton} ${classes.board_info_line_sm_skeleton}`} />
              </>
            ) : (
              <>
                {boardInfo?.imageSrc ? (
                  loadedBoardImageSrc === boardInfo.imageSrc ? (
                    <img src={boardInfo.imageSrc} alt={boardInfo.title ?? 'board'} />
                  ) : failedBoardImageSrc === boardInfo.imageSrc ? (
                    <Default />
                  ) : (
                    <div className={`${classes.skeleton} ${classes.board_info_img_skeleton}`} />
                  )
                ) : boardInfo?.imageState === 'unknown' ? (
                  <div className={`${classes.skeleton} ${classes.board_info_img_skeleton}`} />
                ) : (
                  <Default />
                )}
                {boardInfo?.title ? <span>{boardInfo.title}</span> : null}
                {boardInfo?.description ? <p>{boardInfo.description}</p> : null}
              </>
            )}
          </div>
        )}
        {boardMenuView === 'board' && isLoggedIn && !isOwnerBoard && ownerParticipant ? (
          <div>
            <div className={classes.owner_block}>
              <span className={classes.owner_title}>Владелец:</span>
              <div className={classes.owner_row}>
                <Link className={classes.owner_link} to={`/user/${ownerParticipant.username}`}>
                  <div className={classes.owner_avatar}>
                    {ownerAvatarSrc ? <img src={ownerAvatarSrc} alt={ownerParticipant.nickname || ownerParticipant.username} /> : <DefaultUser />}
                  </div>
                  <div className={classes.owner_names}>
                    <span className={classes.owner_name}>{ownerParticipant.nickname || ownerParticipant.username}</span>
                    <span className={classes.owner_username}>@{ownerParticipant.username}</span>
                  </div>
                </Link>
                <Mainbtn variant="mini" kind="navlink" href={`/user/${ownerParticipant.username}`} text="Открыть" />
              </div>
            </div>
          </div>
        ) : null}
        {boardMenuView === 'board' && isLoggedIn && !isOwnerBoard && isGuestBoard ? (
          <div className={classes.leave_board_row}>
            <DropdownWrapper upDel closeOnClick={false} isOpen={leaveConfirmOpen} onClose={() => setLeaveConfirmOpen(false)}>
              {[
                <button
                  key="trigger"
                  type="button"
                  className={classes.leave_board_trigger}
                  onClick={() => setLeaveConfirmOpen((v) => !v)}
                  disabled={leaveLoading || participantsInitialLoading}
                  aria-label="Покинуть доску"
                >
                  Покинуть доску
                </button>,
                <div key="menu">
                  <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={leaveBoard} disabled={leaveLoading || participantsInitialLoading}>
                    {'Покинуть'}
                  </button>
                  <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setLeaveConfirmOpen(false)} disabled={leaveLoading || participantsInitialLoading}>
                    Отмена
                  </button>
                </div>,
              ]}
            </DropdownWrapper>
          </div>
        ) : null}
        {boardMenuView === 'board' && isLoggedIn ? (
          isBoardMetaLoading ? (
            <div className={classes.board_info_actions}>
              <div className={`${classes.skeleton} ${classes.board_info_actions_skeleton}`} />
            </div>
          ) : isOwnerBoard ? (
            <div className={classes.board_info_actions}>
              <Mainbtn variant="mini" kind="button" type="button" text="Настройки" onClick={onOpenBoardSettings} />
            </div>
          ) : null
        ) : null}
        {boardMenuView === 'board' && !isLoggedIn && isInitialized ? (
          <div className={classes.participants}>
            <div className={classes.participant_add}>
              <AuthTrigger type="login">
                <Mainbtn variant="mini" kind="button" type="button" text="Войти как гость" />
              </AuthTrigger>
            </div>
          </div>
        ) : null}
        {boardMenuView === 'board' && isLoggedIn && shouldShowParticipants ? (
          <div className={classes.participants}>
            {participantsInitialLoading ? (
              <div className={`${classes.skeleton} ${classes.participants_title_skeleton}`} />
            ) : (
              <span className={classes.participants_title}>Участники:</span>
            )}
            <div className={classes.participants_list}>
              {canManageParticipants ? (
                participantsInitialLoading ? (
                  <div className={`${classes.skeleton} ${classes.participant_add_skeleton}`} />
                ) : (
                  <div className={classes.participant_add}>
                    <div className={classes.participant_add_row}>
                      <div className={classes.participant_add_main}>
                        <Mainbtn
                          variant="mini"
                          kind="button"
                          type="button"
                          text="Добавить участников"
                          onClick={() => onOpenParticipantsSettings('friends')}
                        />
                      </div>
                      <Mainbtn
                        variant="mini"
                        kind="button"
                        type="button"
                        className={classes.participant_add_icon}
                        text={<Members />}
                        onClick={() => onOpenParticipantsSettings('guests')}
                      />
                    </div>
                  </div>
                )
              ) : null}
              {participantsInitialLoading ? (
                <>
                  {[0, 1, 2].map((idx) => (
                    <div className={classes.participant_item} key={`participant-skeleton-${idx}`}>
                      <div className={classes.participant_link}>
                        <div className={`${classes.skeleton} ${classes.participant_avatar_skeleton}`} />
                        <div className={classes.participant_names}>
                          <div className={`${classes.skeleton} ${classes.participant_name_skeleton}`} />
                          <div className={`${classes.skeleton} ${classes.participant_username_skeleton}`} />
                        </div>
                      </div>
                      <div className={`${classes.skeleton} ${classes.participant_role_skeleton}`} />
                      {canManageParticipants ? <div className={`${classes.skeleton} ${classes.participant_remove_skeleton}`} /> : null}
                    </div>
                  ))}
                </>
              ) : null}
              {!participantsInitialLoading ? guests.map((p) => {
                const avatarSrc = resolveAvatarSrc(p.avatar);
                const displayName = (p.nickname ?? '').trim() || p.username;
                const shouldShowUsername = Boolean((p.nickname ?? '').trim());
                const isRoleBusy = roleLoadingParticipantId === p.id;
                const isAvatarLoaded = Boolean(avatarSrc && loadedParticipantAvatarSrcs[avatarSrc]);
                const isAvatarFailed = Boolean(avatarSrc && failedParticipantAvatarSrcs[avatarSrc]);
                const roleLabel = p.role === 'editer' ? 'Редактор' : 'Гость';

                return (
                  <div className={classes.participant_item} key={p.id}>
                    <Link className={classes.participant_link} to={`/user/${p.username}`}>
                      <div className={classes.participant_avatar}>
                        {avatarSrc && !isAvatarFailed ? (
                          <>
                            {!isAvatarLoaded ? <div className={`${classes.skeleton} ${classes.participant_avatar_skeleton} ${classes.participant_avatar_overlay}`} /> : null}
                            <img
                              src={avatarSrc}
                              alt={displayName}
                              className={`${classes.participant_avatar_img} ${isAvatarLoaded ? classes.participant_avatar_img_visible : classes.participant_avatar_img_hidden}`}
                              loading="lazy"
                              onLoad={() => setLoadedParticipantAvatarSrcs((prev) => (prev[avatarSrc] ? prev : { ...prev, [avatarSrc]: true }))}
                              onError={() => setFailedParticipantAvatarSrcs((prev) => (prev[avatarSrc] ? prev : { ...prev, [avatarSrc]: true }))}
                            />
                          </>
                        ) : (
                          <DefaultUser />
                        )}
                      </div>
                      <div className={classes.participant_names}>
                        <span className={classes.participant_name}>{displayName}</span>
                        {shouldShowUsername ? <span className={classes.participant_username}>{p.username}</span> : null}
                      </div>
                    </Link>
                    {isOwner ? (
                      <DropdownWrapper upDel isOpen={roleDropdownParticipantId === p.id} onClose={() => setRoleDropdownParticipantId(null)}>
                        {[
                          <button
                            key="trigger"
                            type="button"
                            className={classes.participant_role_btn}
                            onClick={() => setRoleDropdownParticipantId((prev) => (prev === p.id ? null : p.id))}
                            disabled={participantsInitialLoading || isRoleBusy}
                          >
                            {roleLabel}
                          </button>,
                          <div key="menu">
                            <button type="button" data-dropdown-class={classes.participant_role_item} onClick={() => updateParticipantRole(p.id, 'guest')} disabled={participantsInitialLoading || isRoleBusy}>Гость</button>
                            <button type="button" data-dropdown-class={classes.participant_role_item} onClick={() => updateParticipantRole(p.id, 'editer')} disabled={participantsInitialLoading || isRoleBusy}>Редактор</button>
                          </div>,
                        ]}
                      </DropdownWrapper>
                    ) : (
                      <span className={classes.participant_role}>{p.role === 'editer' ? 'Редактор' : 'Гость'}</span>
                    )}
                    {shouldShowOwnerActions ? (
                      <DropdownWrapper right middleleft closeOnClick={false} isOpen={removeConfirmParticipantId === p.id} onClose={() => setRemoveConfirmParticipantId(null)}>
                        {[
                          <button
                            key="trigger"
                            type="button"
                            className={classes.participant_remove}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRemoveConfirmParticipantId((prev) => (prev === p.id ? null : p.id));
                            }}
                            disabled={participantsInitialLoading || removeLoadingParticipantId === p.id}
                            aria-label="Удалить участника"
                          >
                            <Deny />
                          </button>,
                          <div key="menu">
                            <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => removeParticipant(p.id)} disabled={participantsInitialLoading || removeLoadingParticipantId === p.id}>Удалить</button>
                            <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setRemoveConfirmParticipantId(null)} disabled={participantsInitialLoading || removeLoadingParticipantId === p.id}>Отмена</button>
                          </div>,
                        ]}
                      </DropdownWrapper>
                    ) : null}
                  </div>
                );
              }) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
