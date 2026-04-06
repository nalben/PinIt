export type AppTheme = 'sand' | 'rose' | 'gold' | 'mint' | 'ocean' | 'peach' | 'plum';

export const THEME_STORAGE_KEY = 'pinit_theme';

export const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'sand', label: '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442' },
  { id: 'rose', label: '\u0420\u043e\u0437\u043e\u0432\u044b\u0439' },
  { id: 'gold', label: '\u0417\u043e\u043b\u043e\u0442\u043e\u0439' },
  { id: 'mint', label: '\u041c\u044f\u0442\u043d\u044b\u0439' },
  { id: 'ocean', label: '\u041e\u043a\u0435\u0430\u043d' },
  { id: 'peach', label: '\u041f\u0435\u0440\u0441\u0438\u043a' },
  { id: 'plum', label: '\u0421\u043b\u0438\u0432\u0430' },
];

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
