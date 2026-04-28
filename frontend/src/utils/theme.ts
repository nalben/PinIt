export type AppTheme = 'sand' | 'rose' | 'gold' | 'mint' | 'ocean' | 'peach' | 'plum';
export type ThemeOption = {
  id: AppTheme;
  labelRu: string;
  labelEn: string;
};

export const THEME_STORAGE_KEY = 'pinit_theme';

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'sand', labelRu: 'Айвори', labelEn: 'Ivory' },
  { id: 'rose', labelRu: 'Сакура', labelEn: 'Sakura' },
  { id: 'gold', labelRu: 'Янтарь', labelEn: 'Amber' },
  { id: 'mint', labelRu: 'Матча', labelEn: 'Matcha' },
  { id: 'ocean', labelRu: 'Лагуна', labelEn: 'Lagoon' },
  { id: 'peach', labelRu: 'Абрикос', labelEn: 'Apricot' },
  { id: 'plum', labelRu: 'Аметист', labelEn: 'Amethyst' },
];

export const getThemeLabel = (theme: ThemeOption, language: 'ru' | 'en') =>
  language === 'en' ? theme.labelEn : theme.labelRu;

export const isAppTheme = (value: unknown): value is AppTheme =>
  value === 'sand' ||
  value === 'rose' ||
  value === 'gold' ||
  value === 'mint' ||
  value === 'ocean' ||
  value === 'peach' ||
  value === 'plum';

export const getStoredTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'sand';

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(raw) ? raw : 'sand';
  } catch {
    return 'sand';
  }
};

export const applyTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
};

export const persistTheme = (theme: AppTheme) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage failures
  }
};
