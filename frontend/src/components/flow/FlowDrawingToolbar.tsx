import React from 'react';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import BackIcon from '@/assets/icons/monochrome/back.svg';
import ColorIcon from '@/assets/icons/monochrome/color.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import classes from './FlowBoard.module.scss';
import { useLanguageStore } from '@/store/languageStore';

type BaseToolbarProps = {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

type DrawToolbarProps = BaseToolbarProps & {
  mode: 'draw';
  strokeWidth: number;
  paletteColor: string | null;
  paletteActive: boolean;
  onStrokeWidthChange: (value: number) => void;
  onOpenPalette: () => void;
  onDone: () => void;
};

type SelectionToolbarProps = BaseToolbarProps & {
  mode: 'selection';
  selectedCount: number;
  paletteColor: string | null;
  paletteActive: boolean;
  deleteConfirmOpen: boolean;
  showGroupAction: boolean;
  showUngroupAction: boolean;
  onOpenPalette: () => void;
  onMoveLayer: (direction: 'up' | 'down') => void;
  onToggleDeleteConfirm: () => void;
  onCloseDeleteConfirm: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
};

export type FlowDrawingToolbarProps = DrawToolbarProps | SelectionToolbarProps;

const ToolbarIconButton: React.FC<{
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ ariaLabel, disabled = false, className, onClick, children }) => (
  <button
    type="button"
    className={`${classes.draw_toolbar_icon_btn} ${disabled ? classes.draw_toolbar_icon_btn_disabled : ''} ${className ?? ''}`.trim()}
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
  >
    {children}
  </button>
);

const ToolbarTextButton: React.FC<{
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ disabled = false, className, onClick, children }) => (
  <button
    type="button"
    className={`${classes.draw_toolbar_text_btn} ${disabled ? classes.draw_toolbar_icon_btn_disabled : ''} ${className ?? ''}`.trim()}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

const ColorTriggerButton: React.FC<{
  ariaLabel: string;
  active: boolean;
  color: string | null;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}> = ({ ariaLabel, active, color, disabled = false, className, onClick }) => (
  <button
    type="button"
    className={`${classes.draw_toolbar_palette_btn} ${active ? classes.draw_toolbar_palette_btn_active : ''} ${
      disabled ? classes.draw_toolbar_icon_btn_disabled : ''
    } ${className ?? ''}`.trim()}
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
  >
    <span className={classes.color_palette_trigger_inner}>
      <ColorIcon />
      <span
        className={`${classes.color_palette_trigger_swatch} ${color ? '' : classes.color_palette_trigger_swatch_default}`.trim()}
        style={color ? { backgroundColor: color } : undefined}
      />
    </span>
  </button>
);

const getSelectedCountLabel = (count: number, isEn: boolean) => {
  if (isEn) return count === 1 ? 'shape' : 'shapes';

  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'линия';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'линии';
  return 'линий';
};

export const FlowDrawingToolbar: React.FC<FlowDrawingToolbarProps> = (props) => {
  const language = useLanguageStore((state) => state.language);
  const isEn = language === 'en';
  const chipLabel = props.mode === 'draw' ? (isEn ? 'Drawing' : 'Рисование') : `${props.selectedCount} ${getSelectedCountLabel(props.selectedCount, isEn)}`;
  const selectionPaletteClassName =
    props.mode === 'selection' && props.selectedCount === 1 ? classes.draw_dock_actions_selection_palette_wide : '';

  return (
    <div ref={props.toolbarRef} className={classes.draw_dock} data-draw-toolbar-mode={props.mode}>
      <div className={classes.draw_dock_meta}>
        <div className={classes.draw_dock_chip}>{chipLabel}</div>
      </div>

      <div className={`${classes.draw_dock_section} ${classes.draw_dock_history}`.trim()}>
        <ToolbarIconButton ariaLabel={props.mode === 'draw' ? (isEn ? 'Undo stroke' : 'Откатить штрих') : (isEn ? 'Undo action' : 'Откатить действие')} disabled={!props.canUndo} onClick={props.onUndo}>
          <BackIcon />
        </ToolbarIconButton>
        <ToolbarIconButton ariaLabel={props.mode === 'draw' ? (isEn ? 'Redo stroke' : 'Вернуть штрих') : (isEn ? 'Redo action' : 'Вернуть действие')} disabled={!props.canRedo} onClick={props.onRedo}>
          <span className={classes.draw_toolbar_icon_btn_flip}>
            <BackIcon />
          </span>
        </ToolbarIconButton>
      </div>

      {props.mode === 'draw' ? (
        <>
          <label className={`${classes.draw_dock_section} ${classes.draw_dock_slider}`.trim()}>
            <span className={classes.draw_dock_slider_title}>{isEn ? 'Brush' : 'Кисть'}</span>
            <div className={classes.draw_dock_slider_row}>
              <input
                type="range"
                min="2"
                max="24"
                step="1"
                value={props.strokeWidth}
                onChange={(event) => props.onStrokeWidthChange(Number(event.currentTarget.value))}
              />
              <span className={classes.draw_dock_slider_value}>{props.strokeWidth}px</span>
            </div>
          </label>

          <div className={`${classes.draw_dock_section} ${classes.draw_dock_actions} ${classes.draw_dock_actions_draw}`.trim()}>
            <ColorTriggerButton
              ariaLabel={isEn ? 'Choose brush color' : 'Выбрать цвет кисти'}
              active={props.paletteActive}
              color={props.paletteColor}
              onClick={props.onOpenPalette}
            />
            <ToolbarTextButton className={classes.draw_toolbar_text_btn_primary} onClick={props.onDone}>
              {isEn ? 'Done' : 'Готово'}
            </ToolbarTextButton>
          </div>
        </>
      ) : (
        <>
          <div className={`${classes.draw_dock_section} ${classes.draw_dock_layer}`.trim()}>
            <ToolbarIconButton ariaLabel={isEn ? 'Move lower' : 'Опустить ниже'} onClick={() => props.onMoveLayer('down')}>
              <span className={classes.draw_dock_rotate_down}>
                <BackIcon />
              </span>
            </ToolbarIconButton>
            <ToolbarIconButton ariaLabel={isEn ? 'Move higher' : 'Поднять выше'} onClick={() => props.onMoveLayer('up')}>
              <span className={classes.draw_dock_rotate_up}>
                <BackIcon />
              </span>
            </ToolbarIconButton>
          </div>

          <div className={`${classes.draw_dock_section} ${classes.draw_dock_actions} ${classes.draw_dock_actions_selection}`.trim()}>
            <ColorTriggerButton
              ariaLabel={isEn ? 'Change shape color' : 'Изменить цвет фигуры'}
              active={props.paletteActive}
              color={props.paletteColor}
              className={selectionPaletteClassName}
              onClick={props.onOpenPalette}
            />
            {props.showGroupAction ? <ToolbarTextButton onClick={props.onGroup}>{isEn ? 'Group' : 'Сгруп.'}</ToolbarTextButton> : null}
            {props.showUngroupAction ? <ToolbarTextButton onClick={props.onUngroup}>{isEn ? 'Ungroup' : 'Разгр.'}</ToolbarTextButton> : null}
            <div className={classes.draw_dock_dropdown_slot}>
              <DropdownWrapper upDel closeOnClick={false} isOpen={props.deleteConfirmOpen} onClose={props.onCloseDeleteConfirm}>
                {[
                  <ToolbarIconButton key="trigger" ariaLabel={isEn ? 'Delete shapes' : 'Удалить фигуры'} className={classes.draw_dock_dropdown_trigger} onClick={props.onToggleDeleteConfirm}>
                    <DeleteIcon />
                  </ToolbarIconButton>,
                  <div key="menu">
                    <button type="button" data-dropdown-class={classes.confirm_danger} onClick={props.onDelete}>
                      {isEn ? 'Yes, delete' : 'Да, удалить'}
                    </button>
                    <button type="button" data-dropdown-class={classes.confirm_cancel} onClick={props.onCloseDeleteConfirm}>
                      {isEn ? 'Cancel' : 'Отмена'}
                    </button>
                  </div>,
                ]}
              </DropdownWrapper>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
