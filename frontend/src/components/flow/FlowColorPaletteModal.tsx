import React from 'react';
import { HexColorPicker } from 'react-colorful';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import classes from './FlowBoard.module.scss';
import { useLanguageStore } from '@/store/languageStore';

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
}) => {
  const language = useLanguageStore((state) => state.language);
  const isEn = language === 'en';

  return (
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
            {isCurrentColorFavorite ? (isEn ? 'Remove from favorites' : 'Убрать из избранного') : (isEn ? 'Add to favorites' : 'Добавить в избранное')}
          </button>
        </div>

        <div className={classes.color_palette_modal_secondary}>
          <div className={classes.color_palette_current}>
            <div className={classes.color_palette_current_label}>{isEn ? 'Current color' : 'Текущий цвет'}</div>
            <div className={classes.color_palette_current_value_row}>
              <span
                className={`${classes.color_palette_current_swatch} ${currentColor ? '' : classes.color_palette_current_swatch_default}`.trim()}
                style={currentColor ? { backgroundColor: currentColor } : undefined}
              />
              <span className={classes.color_palette_current_value}>{currentColor ?? (isEn ? 'Default' : 'Стандартный')}</span>
            </div>
          </div>

          <div className={classes.color_palette_section}>
            <div className={classes.color_palette_section_title}>{isEn ? 'Base colors' : 'Базовые цвета'}</div>
            <div className={classes.color_palette_swatch_grid}>
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${classes.color_palette_swatch_btn} ${currentColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                  style={{ backgroundColor: color }}
                  onClick={() => onColorChange(color)}
                  aria-label={`${isEn ? 'Choose color' : 'Выбрать цвет'} ${color}`}
                />
              ))}
            </div>
          </div>

          <div className={classes.color_palette_section}>
            <div className={classes.color_palette_section_title}>{isEn ? 'Board colors' : 'Цвета на доске'}</div>
            {boardColorOptions.length ? (
              <div className={classes.color_palette_swatch_grid}>
                {boardColorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${classes.color_palette_swatch_btn} ${currentColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                    style={{ backgroundColor: color }}
                    onClick={() => onColorChange(color)}
                    aria-label={`${isEn ? 'Choose color' : 'Выбрать цвет'} ${color}`}
                  />
                ))}
              </div>
            ) : (
              <div className={classes.color_palette_empty}>{boardColorsEmptyLabel}</div>
            )}
          </div>

          <div className={classes.color_palette_section}>
            <div className={classes.color_palette_section_title}>{isEn ? 'Favorite colors' : 'Избранные цвета'}</div>
            {favoriteColors.length ? (
              <div className={classes.color_palette_swatch_grid}>
                {favoriteColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${classes.color_palette_swatch_btn} ${currentColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                    style={{ backgroundColor: color }}
                    onClick={() => onColorChange(color)}
                    aria-label={`${isEn ? 'Choose color' : 'Выбрать цвет'} ${color}`}
                  />
                ))}
              </div>
            ) : (
              <div className={classes.color_palette_empty}>{favoritesLoading ? (isEn ? 'Loading...' : 'Загрузка...') : (isEn ? 'No favorite colors yet.' : 'Избранных цветов пока нет.')}</div>
            )}
          </div>
        </div>
      </div>

      <div className={classes.color_palette_modal_actions}>
        <Mainbtn variant="mini" kind="button" type="button" text={isEn ? 'Cancel' : 'Отмена'} onClick={onCancel} disabled={cancelDisabled} />
        <Mainbtn variant="mini" kind="button" type="button" text={isEn ? 'Save' : 'Сохранить'} onClick={onSave} disabled={saveDisabled} />
      </div>
    </div>
  );
};
