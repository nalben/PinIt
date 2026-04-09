import React from 'react';
import { HexColorPicker } from 'react-colorful';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import classes from './FlowBoard.module.scss';

type FlowColorPaletteModalProps = {
  title: string;
  ariaLabel: string;
  currentColor: string | null;
  pickerColorValue: string;
  presetColors: readonly string[];
  boardColorOptions: string[];
  boardColorsEmptyLabel: string;
  favoriteColors: string[];
  favoritesLoading: boolean;
  isCurrentColorFavorite: boolean;
  isConstrained?: boolean;
  style?: React.CSSProperties;
  paletteRef?: React.RefObject<HTMLDivElement | null>;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  onColorChange: (color: string) => void;
  onToggleFavorite: () => void;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  cancelDisabled?: boolean;
  favoriteDisabled?: boolean;
};

export const FlowColorPaletteModal: React.FC<FlowColorPaletteModalProps> = ({
  title,
  ariaLabel,
  currentColor,
  pickerColorValue,
  presetColors,
  boardColorOptions,
  boardColorsEmptyLabel,
  favoriteColors,
  favoritesLoading,
  isCurrentColorFavorite,
  isConstrained = false,
  style,
  paletteRef,
  bodyRef,
  onColorChange,
  onToggleFavorite,
  onCancel,
  onSave,
  saveDisabled = false,
  cancelDisabled = false,
  favoriteDisabled = false,
}) => (
  <div
    ref={paletteRef}
    className={`${classes.color_palette_modal} ${isConstrained ? classes.color_palette_modal_constrained : classes.color_palette_modal_expanded}`.trim()}
    data-modal-scope="color-palette"
    style={style}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
    onClick={(event) => event.stopPropagation()}
  >
    <div className={classes.color_palette_modal_header}>{title}</div>
    <div ref={bodyRef} className={classes.color_palette_modal_body}>
      <div className={classes.color_palette_modal_primary}>
        <div className={classes.color_palette_picker}>
          <HexColorPicker color={pickerColorValue} onChange={onColorChange} />
        </div>
        <button
          type="button"
          className={classes.color_palette_favorite_btn}
          onClick={() => onToggleFavorite()}
          disabled={favoriteDisabled}
        >
          {isCurrentColorFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        </button>
      </div>

      <div className={classes.color_palette_modal_secondary}>
        <div className={classes.color_palette_current}>
          <div className={classes.color_palette_current_label}>Текущий цвет</div>
          <div className={classes.color_palette_current_value_row}>
            <span
              className={`${classes.color_palette_current_swatch} ${currentColor ? '' : classes.color_palette_current_swatch_default}`.trim()}
              style={currentColor ? { backgroundColor: currentColor } : undefined}
            />
            <span className={classes.color_palette_current_value}>{currentColor ?? 'Стандартный'}</span>
          </div>
        </div>

        <div className={classes.color_palette_section}>
          <div className={classes.color_palette_section_title}>Базовые цвета</div>
          <div className={classes.color_palette_swatch_grid}>
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                className={`${classes.color_palette_swatch_btn} ${currentColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                style={{ backgroundColor: color }}
                onClick={() => onColorChange(color)}
                aria-label={`Выбрать цвет ${color}`}
              />
            ))}
          </div>
        </div>

        <div className={classes.color_palette_section}>
          <div className={classes.color_palette_section_title}>Цвета на доске</div>
          {boardColorOptions.length ? (
            <div className={classes.color_palette_swatch_grid}>
              {boardColorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${classes.color_palette_swatch_btn} ${currentColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                  style={{ backgroundColor: color }}
                  onClick={() => onColorChange(color)}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
          ) : (
            <div className={classes.color_palette_empty}>{boardColorsEmptyLabel}</div>
          )}
        </div>

        <div className={classes.color_palette_section}>
          <div className={classes.color_palette_section_title}>Избранные цвета</div>
          {favoriteColors.length ? (
            <div className={classes.color_palette_swatch_grid}>
              {favoriteColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${classes.color_palette_swatch_btn} ${currentColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                  style={{ backgroundColor: color }}
                  onClick={() => onColorChange(color)}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
          ) : (
            <div className={classes.color_palette_empty}>{favoritesLoading ? 'Загрузка...' : 'Избранных цветов пока нет.'}</div>
          )}
        </div>
      </div>
    </div>

    <div className={classes.color_palette_modal_actions}>
      <Mainbtn variant="mini" kind="button" type="button" text="Отмена" onClick={onCancel} disabled={cancelDisabled} />
      <Mainbtn variant="mini" kind="button" type="button" text="Сохранить" onClick={onSave} disabled={saveDisabled} />
    </div>
  </div>
);
